import type { Request } from "express";

import type { AppErrorCode } from "./error";


/**
 * 一次请求 最终的业务结果
 *  - pending: 请求仍在处理
 *  - bad_request: 请求参数不合法
 *  - success: 正常完成
 *  - stopped: 用户主动停止
 *  - client_closed: 浏览器或网络提前断开
 *  - timeout: 首 Token 或整体请求超时
 *  - error: Provider、Embedding 或未知内部错误
 */
export type RequestOutcome =
    | 'pending'
    | 'success'
    | 'bad_request'
    | 'stopped'
    | 'client_closed'
    | 'timeout'
    | 'error';

/**
 * 完整的请求生命周期共享日志上下文
 *  - requestLogger 创建 基础字段
 *  - ChatRoute 执行过程中 补充业务字段
 *  - 请求结束时 由Logger统一输出
 */
export type RequestContext = {
    requestId: string;
    startedAt: number;

    provider?: string;
    model?: string;
    rag?: boolean;
    toolName?: string;

    outcome: RequestOutcome;
    errorCode?: AppErrorCode;
};

/**
 * 缓存 每个请求的上下文信息
 */
const requestContextMap = new WeakMap<Request, RequestContext>();

/**
 * 创建短 requestId
 */
function createShortId(): string {
    return Math.random().toString(16).slice(2, 6);
};

/**
 * 创建 请求初始化上下文
 */
export function createRequestContext(req: Request):RequestContext {
    const context: RequestContext = {
        requestId: createShortId(),
        startedAt: Date.now(),
        outcome: 'pending',
    };

    requestContextMap.set(req, context);

    return context;
};

/**
 *  获取 当前请求上下文
 */
export function getRequestContext(req: Request): RequestContext {
    const context = requestContextMap.get(req);

    if (!context) throw new Error("Request context is not initialized");

    return context;
};