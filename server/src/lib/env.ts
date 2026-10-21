import { DEFAULT_RAG_INDEX_CONFIG } from "../rag/config";

export type Env = {
    PORT: number;
    CORS_ORIGIN: string;

    THOTH_BASE_URL: string;
    THOTH_API_KEY: string;
    THOTH_MODEL: string;

    THOTH_FIRST_TOKEN_TIMEOUT_MS: number;
    THOTH_OVERALL_TIMEOUT_MS: number;
    THOTH_PING_INTERVAL_MS: number;

    THOTH_EMBEDDING_BASE_URL: string;
    THOTH_EMBEDDING_API_KEY: string;
    THOTH_EMBEDDING_MODEL: string;
    THOTH_EMBEDDING_BATCH_SIZE: number
};

function num(name: string, fallback: number) {
    const raw = process.env[name];
    if (!raw) return fallback;

    const n = Number(raw);

    return Number.isFinite(n) ? n : fallback;
};

/** 数量上限等必须为正整数的配置 */
function positiveInteger(name: string, fallback: number) {
    const raw = process.env[name];

    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);

    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer`)
    }

    return value;
};

export function loadEnv(): Env {
    return {
        PORT: num('PORT', 3001),
        THOTH_EMBEDDING_BATCH_SIZE: positiveInteger('THOTH_EMBEDDING_BATCH_SIZE', DEFAULT_RAG_INDEX_CONFIG.embeddingBatchSize),
        CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

        // Week1：允许为空（为空则走 fake provider），但建议你配上 DeepSeek
        THOTH_BASE_URL: process.env.THOTH_BASE_URL || 'https://api.deepseek.com',
        THOTH_API_KEY: process.env.THOTH_API_KEY || '',
        THOTH_MODEL: process.env.THOTH_MODEL || 'deepseek-chat',

        THOTH_FIRST_TOKEN_TIMEOUT_MS: num('THOTH_FIRST_TOKEN_TIMEOUT_MS', 10000),
        THOTH_OVERALL_TIMEOUT_MS: num('THOTH_OVERALL_TIMEOUT_MS', 60000),
        THOTH_PING_INTERVAL_MS: num('THOTH_PING_INTERVAL_MS', 15000),

        THOTH_EMBEDDING_BASE_URL: process.env.THOTH_EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
        THOTH_EMBEDDING_API_KEY: process.env.THOTH_EMBEDDING_API_KEY || '',
        THOTH_EMBEDDING_MODEL: process.env.THOTH_EMBEDDING_MODEL || 'text-embedding-3-small',
    }
}