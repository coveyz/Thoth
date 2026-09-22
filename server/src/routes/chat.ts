import { Router } from 'express';
import { initSSE, endSSE, safeWriteEvent } from '../lib/sse';
import { getProvider } from '../providers/index';
import { isToolName } from '../tools';
import { prepareAssistantTurn } from '../orchestrators/chatOrchestrators';
import { prepareRagTurn } from '../orchestrators/ragOrchestrators';
import { AppError, isAbortError, toPublicError } from '../lib/error';

import type { Env } from '../lib/env';
import type { ToolChoice } from '../prompts/system';
import { getRequestContext } from '../lib/requestContext';

/** 解析客户端传入的 toolChoice 非法值统一回退到 auto */
const readToolChoice = (value: unknown): ToolChoice => {
    if (value === 'none') return 'none';
    if (value === 'auto' || value === null) return 'auto';

    if (isToolName(value)) return value;

    return 'auto'
}

export function chatRouter(env: Env) {
    const router = Router();

    router.post('/stream', async (req, res) => {
        const requestContext = getRequestContext(req);
        const requestId = requestContext.requestId;

        // SSE 连接初始化
        initSSE(res);

        res.socket?.setTimeout(0); // 连接保持，避免超时断开
        res.socket?.setNoDelay(true); // 立即发送数据，避免 Nagle 算法引起的延迟
        res.socket?.setKeepAlive(true); // 启用 TCP keep-alive，检测死连接

        const message = req.body?.message;
        const toolChoice = readToolChoice(req.body?.toolChoice);
        const useRag = req.body?.rag === true;
        requestContext.rag = useRag; // 即使后面参数校验失败，也记录客户端是否请求了 RAG。

        if (typeof message !== 'string' || !message.trim()) {
            requestContext.outcome = 'bad_request'; // 请求参数不合法
            requestContext.errorCode = 'BAD_REQUEST'; // 设置错误码

            const publicError = toPublicError(new AppError('BAD_REQUEST', { publicMessage: 'message is required' }))
            await safeWriteEvent(res, 'error', {
                ...publicError,
                requestId,
            });
            return endSSE(res);
        };

        /** 用于中断上游请求 */
        const upstreamAbort = new AbortController();
        /** 用来阻止 后续写入与循环继续 不用 req.on('close') 判断 stop (post时req的close 语义不等价于 SSE断开) */
        let clientClosed = false;
        /** 首token 超时 保证不会一直loading */
        let gotAnyDelta = false;

        // 客户端断开连接， 比如用户关闭了页面， 这时我们应该中断上游请求， 并且不再写入 SSE
        res.on('close', () => {
            if (res.writableEnded) return; // 我们自己正常 end 的不算 stop
            clientClosed = true;

            if (requestContext.outcome === 'pending') {
                requestContext.outcome = 'client_closed';
            };

            upstreamAbort.abort();
        });
        // 请求被中断， 比如客户端中断请求
        req.on('aborted', () => {
            clientClosed = true;

            if (requestContext.outcome === 'pending') {
                requestContext.outcome = 'client_closed';
            };

            upstreamAbort.abort();
        });

        // 选择 provider， 目前根据环境变量决定，后续可以更复杂的策略
        const provider = getProvider(env);
        requestContext.provider = provider.name; // 记录选择的 provider
        requestContext.model = provider.model; // 记录选择的模型

        // start事件： 协议固定
        // 无论 direct 还是 tool 模式， 都先发送 start 事件， 前端拿到 start 事件后才会展示 loading 状态， 避免模型响应慢时 前端一直loading
        if (!(await safeWriteEvent(res, 'start', { requestId, model: provider.model }))) {
            // 写不进去说明链接已经断了， 直接结束
            clientClosed = true;
            requestContext.outcome = 'client_closed'; // 客户端关闭
            upstreamAbort.abort();
            return endSSE(res);
        };

        // 心跳： 防止长链接在代理网络中 当成空闲链接断开
        const pingTimer = setInterval(() => {
            if (clientClosed) return;
            // 心跳失败也直接关闭 （说明已经断开）
            safeWriteEvent(res, 'ping', { t: Date.now() }).then((ok) => {
                if (!ok) {
                    clientClosed = true;
                    upstreamAbort.abort();
                };
            });
        }, env.THOTH_PING_INTERVAL_MS);

        /** 整体超时： 防止长时间挂起 */
        const overallTimer = setTimeout(() => {
            if (clientClosed) return;

            clientClosed = true;

            requestContext.outcome = 'timeout'; // 整体超时
            requestContext.errorCode = 'OVERALL_TIMEOUT'

            upstreamAbort.abort();

            const publicError = toPublicError(new AppError('OVERALL_TIMEOUT'))

            safeWriteEvent(res, 'error', {
                ...publicError,
                requestId
            }).finally(() => {
                clearInterval(pingTimer);
                endSSE(res);
            });
        }, env.THOTH_OVERALL_TIMEOUT_MS);

        let firstTokenTimer: ReturnType<typeof setTimeout> | null = null;

        try {

            if (useRag) {
                const prepared = await prepareRagTurn({
                    userMessage: message.trim(),
                    env
                });

                if (clientClosed) return;

                // 先把 sources 通过 SSE 提前给前端， 前端可以先展示 sources， 然后再展示最终回答
                const ok = await safeWriteEvent(res, 'sources', {
                    sources: prepared.sources
                });

                if (!ok) {
                    clientClosed = true;
                    upstreamAbort.abort();
                    return;
                }

                firstTokenTimer = setTimeout(() => {
                    if (clientClosed || gotAnyDelta) return;

                    clientClosed = true;

                    requestContext.outcome = 'timeout'; // 首个 token 超时
                    requestContext.errorCode = 'FIRST_TOKEN_TIMEOUT';

                    upstreamAbort.abort();

                    const publicError = toPublicError(new AppError('FIRST_TOKEN_TIMEOUT'))

                    safeWriteEvent(res, 'error', {
                        ...publicError,
                        requestId
                    }).finally(() => {
                        clearInterval(pingTimer);
                        endSSE(res)
                    })

                }, env.THOTH_FIRST_TOKEN_TIMEOUT_MS);

                for await (const delta of provider.stream(
                    { messages: prepared.finalMessages, temperature: 0.2 },
                    { signal: upstreamAbort.signal })
                ) {
                    if (clientClosed) break;

                    gotAnyDelta = true;

                    if (firstTokenTimer) {
                        clearTimeout(firstTokenTimer);
                        firstTokenTimer = null;
                    };

                    const ok = await safeWriteEvent(res, 'delta', delta);

                    if (!ok) {
                        clientClosed = true;
                        upstreamAbort.abort();
                        break;
                    };
                };

                if (!clientClosed) {
                    const doneWritten = await safeWriteEvent(res, 'done', { ok: true });

                    requestContext.outcome = doneWritten
                        ? 'success'
                        : 'client_closed';

                    endSSE(res);
                };

                return;
            }

            // Week1 收到用户消息直接 provider.stream
            // week2 先经过编排 决定是否执行工具，并生成最终回答上下文 核心编排
            const prepared = await prepareAssistantTurn({
                provider,
                userMessage: message.trim(),
                requestId,
                signal: upstreamAbort.signal,
                toolChoice
            })

            if (clientClosed) return;

            // 工具调用开始，先把调用了什么工具， 为什么调用，参数是什么告诉前端
            if (prepared.toolCall) {
                requestContext.toolName = prepared.toolCall.name;

                const ok = await safeWriteEvent(res, 'tool_call', {
                    name: prepared.toolCall.name,
                    arguments: prepared.toolCall.arguments,
                    reason: prepared.toolCall.reason
                })

                if (!ok) {
                    clientClosed = true;
                    upstreamAbort.abort();
                    return;
                }
            }
            // 工具执行成功， 通知前端工具结果
            if (prepared.toolResult !== undefined) {
                const ok = await safeWriteEvent(res, 'tool_result', {
                    name: prepared.toolCall?.name,
                    ok: true,
                    result: prepared.toolResult
                })

                if (!ok) {
                    clientClosed = true;
                    upstreamAbort.abort();
                    return;
                }
            }
            // 工具执行失败， 通知前端工具错误，后续仍继续走最终回答 fallback
            if (prepared.toolError) {
                const ok = await safeWriteEvent(res, 'tool_error', {
                    name: prepared.toolCall?.name,
                    message: prepared.toolError
                })
                if (!ok) {
                    clientClosed = true;
                    upstreamAbort.abort();
                    return;
                }
            }

            // fist token timeout 只作用在最终回答流
            // 工具决策 和 工具执行 阶段由 overall timeout 统一兜底
            firstTokenTimer = setTimeout(() => {
                if (clientClosed || gotAnyDelta) return;

                clientClosed = true;

                requestContext.outcome = 'timeout'; // 首个 token 超时
                requestContext.errorCode = 'FIRST_TOKEN_TIMEOUT';

                upstreamAbort.abort();

                const publicError = toPublicError(
                    new AppError(
                        'FIRST_TOKEN_TIMEOUT'
                    )
                );


                safeWriteEvent(res, 'error', {
                    ...publicError,
                    requestId
                }).finally(() => {
                    clearInterval(pingTimer);
                    endSSE(res)
                })

            }, env.THOTH_FIRST_TOKEN_TIMEOUT_MS);

            for await (const delta of provider.stream(
                { messages: prepared.finalMessages, temperature: 0.2 },
                { signal: upstreamAbort.signal }
            )) {
                if (clientClosed) break;

                gotAnyDelta = true;

                if (firstTokenTimer) {
                    clearTimeout(firstTokenTimer);
                    firstTokenTimer = null;
                }

                const ok = await safeWriteEvent(res, 'delta', delta);
                if (!ok) {
                    clientClosed = true;
                    upstreamAbort.abort();
                    break;
                }
            }

            if (!clientClosed) {
                const doneWritten = await safeWriteEvent(res, 'done', { ok: true });

                requestContext.outcome = doneWritten
                    ? 'success'
                    : 'client_closed';

                endSSE(res);
            };
        } catch (error: unknown) {
            // 如果客户端已断开， 不需要再写SSE
            if (clientClosed) return;

            if (isAbortError(error)) {
                requestContext.outcome = 'stopped';

                await safeWriteEvent(res, 'done', { ok: true, reason: 'stop' });
                return endSSE(res);
            };

            const publicError = toPublicError(error);
            requestContext.outcome = 'error';
            requestContext.errorCode = publicError.code;

            await safeWriteEvent(res, 'error', { ...publicError, requestId });
            endSSE(res);
        } finally {
            clearInterval(pingTimer);
            clearTimeout(overallTimer);
            if (firstTokenTimer) {
                clearTimeout(firstTokenTimer);
            }
        }
    });

    return router
};