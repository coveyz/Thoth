import "dotenv/config";

import { createApp } from './app';
import { loadEnv } from './lib/env';

// 生产或本地开发环境从 process.env 读取配置。
const env = loadEnv();
const app = createApp(env);

// 只有进程入口负责监听端口
app.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT}`);
});