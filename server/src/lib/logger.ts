import type { RequestHandler } from 'express';

import { createRequestContext, } from './requestContext';
import type { RequestOutcome } from './requestContext';
import type { AppErrorCode } from './error';

/**
 * 请求结束时输出的结构化日志
 */
export type RequestLogEntry = {
    level: 'info',
    event: 'request.completed',
    timestamp: string;

    requestId: string;
    method: string;
    path: string;
    statusCode: number;
    latencyMs: number

    provider?: string;
    model?: string;
    rag?: boolean;
    toolName?: string;

    outcome: RequestOutcome;
    errorCode?: AppErrorCode;
};

/** 日志写入函数 类型 */
export type LogWriter = (entry: RequestLogEntry) => void;

/**
 * 默认日志写入器
 */
const defaultLogWriter: LogWriter = (entry) => {
    console.log(JSON.stringify(entry))
};

export function requestLogger(writeLog: LogWriter = defaultLogWriter): RequestHandler {
    return (req, res, next) => {
        const context = createRequestContext(req);
        // finish 和 close 在某些情况下都可能触发。使用 logged 保证一次请求只输出一条完成日志
        let logged = false;

        const finalize = (endedBy: 'finish' | 'close') => {
            if (logged) return;
            logged = true;
            // 普通 Health 请求没有业务层显式设置 outcome， finish 可以视为结束
            // 如果连接提前 close，则记录 client_closed
            if (context.outcome === 'pending') {
                context.outcome = endedBy === 'close' && !res.writableEnded
                    ? 'client_closed'
                    : 'success'
            };

            const entry: RequestLogEntry = {
                level: 'info',
                event: 'request.completed',
                timestamp: new Date().toISOString(),

                requestId: context.requestId,
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                latencyMs: Date.now() - context.startedAt,

                provider: context.provider,
                model: context.model,
                rag: context.rag,
                toolName: context.toolName,

                outcome: context.outcome,
                errorCode: context.errorCode,
            };
            writeLog(entry);
        };

        res.on('finish', () => finalize('finish'));
        res.on('close', () => finalize('close'));
        next();
    };
};