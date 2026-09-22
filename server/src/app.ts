import express from 'express';
import cors from 'cors';

import { requestLogger } from './lib/logger';
import { chatRouter } from './routes/chat';
import type { Env } from "./lib/env";
import type { LogWriter } from './lib/logger';

type CreateAppOptions = {
    writeLog?: LogWriter
}

/**
 * 创建 Thoth 的Express App
 *  1. 开发环境有 index 决定监听哪个端口
 *  2. 自动测试 app 交给Supertest
 *  3. 导入这个文件不会产生“占用端口”这样的副作用
 */
export function createApp(env: Env, options: CreateAppOptions = {}) {
    const app = express();

    // 隐藏 Express 默认返回的 X-Powered-By 响应头。
    app.disable("x-powered-by");
    // JSON 体积限制 避免被大包拖垮 week1
    app.use(express.json({ limit: '1mb' }));
    // 只允许配置中的前端地址跨域访问 
    app.use(cors({ origin: env.CORS_ORIGIN }));
    // 每个请求一个短id， 方便定位 ‘中断/超时/上游报错’
    app.use(requestLogger(options.writeLog));

    // 健康检查不依赖 Chat Provider 或 Embedding Provider。
    app.get("/healthz", (_req, res) => {
        res.json({ ok: true, version: '0.1.0' });
    });
    // 所有聊天接口统一挂载到 /api/chat
    app.use('/api/chat', chatRouter(env));

    return app;
};