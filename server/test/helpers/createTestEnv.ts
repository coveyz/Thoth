import type { Env } from "../../src/lib/env";


export function createTestEnv(
    overrides: Partial<Env> = {}
): Env {
    const defaultEnv: Env = {
        /** Supertest 不会真正让 App 固定监听这个端口 */
        PORT: 3001,
        /**  CORS 对服务端直接测试没有太大影响， */
        CORS_ORIGIN: 'http://localhost:5173',

        /**
        * Chat Provider 配置。
        *
        * THOTH_API_KEY 故意留空：
        * getProvider() 检测到空 Key 后会使用 Fake Provider。
        *
        * 这是防止自动测试误用真实 API 的关键配置。
        */
        THOTH_BASE_URL: 'https://api.deepseek.com',
        THOTH_API_KEY: '',
        THOTH_MODEL: 'deepseek-chat',

        /**
        * 自动测试中的超时暂时设置得足够宽松。
        *
        * Fake Provider 每次 delta 前约等待 40ms，
        * 1000ms 足够它返回首个 Token。
        */
        THOTH_FIRST_TOKEN_TIMEOUT_MS: 1000,
        THOTH_OVERALL_TIMEOUT_MS: 5000,
        THOTH_PING_INTERVAL_MS: 1000,

        /**
         * 第一批测试不会启用 RAG，
         * 因此不会实际使用这些 Embedding 配置。
         *
         * Key 留空同样可以防止意外网络调用。
         */
        THOTH_EMBEDDING_BASE_URL: 'https://api.openai.com/v1',
        THOTH_EMBEDDING_API_KEY: '',
        THOTH_EMBEDDING_MODEL: 'text-embedding-3-small',
    }

    return {
        ...defaultEnv,
        ...overrides
    }
}