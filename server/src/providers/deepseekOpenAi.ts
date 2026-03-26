import OpenAi from 'openai';

import type { Provider } from './types';


export const createDeepSeekProvider = (opts: {
    baseUrl: string;
    apiKey: string;
    model: string;
}): Provider => {
    const client = new OpenAi({
        baseURL: opts.baseUrl.replace(/\/+$/, ''), // 去除末尾斜杠
        apiKey: opts.apiKey.trim(),
    });

    return {
        name: 'deepseek',
        model: opts.model,
        async *stream({ message }, { signal }) {
            const stream = await client.chat.completions.create(
                {
                    model: opts.model,
                    stream: true,
                    messages: [{ role: 'user', content: message }]
                },
                { signal }
            );

            for await (const chunk of stream) {
                const delta = chunk.choices?.[0]?.delta?.content;

                if (typeof delta === 'string' && delta.length > 0) {
                    yield delta;
                };
            }

        }
    }
}