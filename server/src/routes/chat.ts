import { Router } from 'express';
import { initSSE, writeEvent, endSSE, safeWriteEvent } from '../lib/sse';
import { getProvider } from '../providers/index';

import type { Env } from '../lib/env';


export function chatRouter(env: Env) {
    const router = Router();

    router.post('/stream', async (req, res) => {
        const requestId = (req as any).requestId ?? 'unknown';

        // SSE 连接初始化
        initSSE(res);

        res.socket?.setTimeout(0); // 连接保持，避免超时断开
        res.socket?.setNoDelay(true); // 立即发送数据，避免 Nagle 算法引起的延迟
        res.socket?.setKeepAlive(true); // 启用 TCP keep-alive，检测死连接


        // 解析 week1: 只收一个message
        const message = req.body?.message;
        if (typeof message !== 'string' || !message.trim()) {
            await safeWriteEvent(res, 'error', {
                code: 'BAD_REQUEST',
                message: 'message is required',
                requestId,
            })
            return endSSE(res);
        };

        // 用于中断上游请求
        const upstreamAbort = new AbortController();

        /**
         * 用来阻止 后续写入与循环继续
         * 不用 req.on('close') 判断 stop (post时req的close 语义不等价于 SSE断开)
         */
        let clientClosed = false;

        // 客户端断开连接， 比如用户关闭了页面， 这时我们应该中断上游请求， 并且不再写入 SSE
        res.on('close', () => {
            if (res.writableEnded) return; // 我们自己正常 end 的不算 stop
            clientClosed = true;
            upstreamAbort.abort();
            console.log(`[${requestId}] client closed (before end)`);
        });
        // 请求被中断， 比如客户端中断请求
        req.on('aborted', () => {
            clientClosed = true;
            upstreamAbort.abort();
            console.log(`[${requestId}] client aborted (before end)`);
        });

        const provider = getProvider(env);
        // start事件： 协议固定
        if (!(await safeWriteEvent(res, 'start', { requestId, model: provider.model }))) {
            // 写不进去说明链接已经断了， 直接结束
            clientClosed = true;
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

        // 首token 超时 保证不会一直loading
        let gotAnyDelta = false;

        const firstTokenTimer = setTimeout(() => {
            if (clientClosed || gotAnyDelta) return;

            // 超时触发： 同时阻止 + 阻止后续写入
            clientClosed = true;
            upstreamAbort.abort();

            safeWriteEvent(res, 'error', {
                code: 'FIRST_TOKEN_TIMEOUT',
                message: `no token within ${env.THOTH_FIRST_TOKEN_TIMEOUT_MS}ms`,
                requestId
            }).finally(() => {
                clearInterval(pingTimer);
                endSSE(res);
            });

        }, env.THOTH_FIRST_TOKEN_TIMEOUT_MS);

        // 整体超时： 防止长时间挂起
        const overallTimer = setTimeout(() => {
            if (clientClosed) return;

            clientClosed = true;
            upstreamAbort.abort();
            
            safeWriteEvent(res, 'error', {
                code: 'OVERALL_TIMEOUT',
                message: `overall timeout of ${env.THOTH_OVERALL_TIMEOUT_MS}ms`,
                requestId
            }).finally(() => {
                clearInterval(pingTimer);
                endSSE(res);
            });
        }, env.THOTH_OVERALL_TIMEOUT_MS);

        try {
            // 主流程循环： 把provider 的 token 增量转换成 delta 事件
            for await (const delta of provider.stream({ message }, { signal: upstreamAbort.signal })) {
                if (clientClosed) break;

                gotAnyDelta = true;
                clearTimeout(firstTokenTimer);

                // writeEvent(res, 'delta', delta);
                const ok = await safeWriteEvent(res, 'delta', delta);
                if (!ok) {
                    clientClosed = true;
                    upstreamAbort.abort();
                    break;
                }
            };

            // 正常完成： done;
            if (!clientClosed) {
                await safeWriteEvent(res, 'done', { ok: true });
                endSSE(res);
            };
        } catch (error: any) {
            // 如果客户端已断开， 不需要再写SSE
            if (clientClosed) return;
            
            // 用户 stop /  上游被中断abort， 统一当正常结束 （done + reason）
            if (error?.name === 'AbortError') {
                await safeWriteEvent(res, 'done', { ok: true, reason: 'stop' });
                return endSSE(res);
            };

            // 其他异常: error事件返回给前端， 避免一直loading
            const code = error?.code ?? "INTERNAL_ERROR";
            const messageOut = typeof error?.message === 'string' ? error.message : 'unknown error';

            console.error(`[${requestId}] error: ${error}`);
            console.error(error);

            // writeEvent(res, 'error', { code, message: messageOut, requestId });
            await safeWriteEvent(res, 'error', { code, message: messageOut, requestId });
            endSSE(res);
        } finally {
            clearInterval(pingTimer);
            clearTimeout(firstTokenTimer);
            clearTimeout(overallTimer);
        }
    });

    return router
};