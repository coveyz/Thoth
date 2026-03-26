import { createFakeProvider } from './fake';
// import { createOpenAICompatProvider } from './openaiCompat';
import { createDeepSeekProvider } from './deepseekOpenAi';

import type { Provider } from './types';
import type { Env } from '../lib/env';

/**
 * Provider 选择策略（Week1）：
 * - 如果 env 配了 baseUrl + apiKey -> 用真实上游（DeepSeek/OpenAI-compatible）
 * - 否则 fallback 到 fake，保证接口可稳定验收
 */
export function getProvider(env: Env): Provider {
    if (env.THOTH_BASE_URL && env.THOTH_API_KEY) {
        return createDeepSeekProvider({
            baseUrl: env.THOTH_BASE_URL,
            apiKey: env.THOTH_API_KEY,
            model: env.THOTH_MODEL,
        })
    };

    return createFakeProvider();
}