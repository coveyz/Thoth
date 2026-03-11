export type Env = {
    PORT: number;
    CORS_ORIGIN: string;

    THOTH_BASE_URL: string;
    THOTH_API_KEY: string;
    THOTH_MODEL: string;

    THOTH_FIRST_TOKEN_TIMEOUT_MS: number;
    THOTH_OVERALL_TIMEOUT_MS: number;
    THOTH_PING_INTERVAL_MS: number;
};

function num(name: string, fallback: number) {
    const raw = process.env[name];
    if (!raw) return fallback;

    const n = Number(raw);
    
    return Number.isFinite(n) ? n : fallback;
};

export function loadEnv(): Env {
    return {
        PORT: num('PORT', 3000),
        CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

        // Week1：允许为空（为空则走 fake provider），但建议你配上 DeepSeek
        THOTH_BASE_URL: process.env.THOTH_BASE_URL || 'https://api.thoth.one/v1',
        THOTH_API_KEY: process.env.THOTH_API_KEY || '',
        THOTH_MODEL: process.env.THOTH_MODEL || 'gpt-3.5-turbo',

        THOTH_FIRST_TOKEN_TIMEOUT_MS: num('THOTH_FIRST_TOKEN_TIMEOUT_MS', 10000),
        THOTH_OVERALL_TIMEOUT_MS: num('THOTH_OVERALL_TIMEOUT_MS', 60000),
        THOTH_PING_INTERVAL_MS: num('THOTH_PING_INTERVAL_MS', 15000),
    }
}