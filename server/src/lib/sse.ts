import type { Response } from 'express';


/**
 * Week1 固定事件协议：
 * - start: { requestId, model }
 * - delta: string
 * - ping: { t }
 * - done:  { ok: true }
 * - error: { code, message, requestId }
 */
export type SSEEventName = 'start' | 'delta' | 'end' | 'ping' | 'done' | 'error';

export function initSSE(res: Response) {
    // SSE 一般保持200 业务错误通过 event:error 告知前端
    res.status(200);

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader('Connection', 'keep-alive');

    // 反向代理(Nginx)场景常用：禁用缓冲，否则可能变成“攒一坨再输出”
    res.setHeader('X-Accel-Buffering', 'no');

    res.flushHeaders?.(); // 立即发送头部，开始 SSE 流
};

/** 
 * 写 SSE 事件，data 会被 JSON.stringify
 */
export function writeEvent(res: Response, event: SSEEventName, data: any) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
};

/**
 * 安全写入
 * - 如果连接已关闭或已销毁，返回 false
 * - 处理 backpressure，如果 write 返回 false，等待 'drain' 事件  
 * - 返回是否写入成功
 */
export async function safeWriteEvent(
    res: Response,
    event: SSEEventName,
    data: unknown
): Promise<boolean> {
    // 已结束或已销毁的连接不再写入
    if (res.writableEnded || res.destroyed) return false;

    try {
        const ok1 = res.write(`event: ${event}\n`);
        const ok2 = res.write(
            `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`
        );
        // backpressure 处理：如果 write 返回 false，说明内部缓冲区已满，需要等待 'drain' 事件 , 否则会导致内存上涨
        if (!ok1 || !ok2) {
            await new Promise<void>((resolve) => res.once('drain', resolve));
        };

        return true;
    } catch (error) {
        return false;
    }
}

export function endSSE(res: Response) {
    res.end();
};
