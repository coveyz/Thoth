import type { RequestHandler } from 'express';

function shortId() {
    // 足够短且可读的 requestId（不追求强随机）
    return Math.random().toString(16).slice(2, 6);
};

export function requestLogger(): RequestHandler {
    return (req, res, next) => {
        const requestId = shortId();
        (req as any).requestId = requestId;

        const start = Date.now();

        res.on('finish', () => {
            const ms = Date.now() - start;

            console.log(
                `[${requestId}] ${req.method} ${req.originalUrl} - ${res.statusCode} ${ms}ms`
            );
        });
        next();
    }
};