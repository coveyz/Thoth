import "dotenv/config";
import express from 'express';
import cors from 'cors';

import { chatRouter } from './routes/chat';
import { loadEnv } from './lib/env';
import { requestLogger } from './lib/logger';

const env = loadEnv();
const app = express();
app.disable("x-powered-by");

// JSON 体积限制 避免被大包拖垮 week1
app.use(express.json({ limit: '1mb' }));
// 只放行本地前端 
app.use(cors({ origin: env.CORS_ORIGIN }));

// 每个请求一个短id， 方便定位 ‘中断/超时/上游报错’
app.use(requestLogger());

app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
});

app.use('/api/chat', chatRouter(env));

app.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT}`);
});