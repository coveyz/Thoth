import OpenAi from 'openai';

import type { Provider, ProviderGenerateInput, ProviderMessage, ProviderStreamInput } from './types';

/** 将通用的 ProviderMessage 转换为 DeepSeek OpenAI 客户端所需的消息格式 */
const toUpstreamMessages = (messages: ProviderMessage[]) => {
    return messages.map((message) => ({
        role: message.role,
        content: message.content,
    }))
};

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
        /** 一次性生成 用于工具决策 */
        async generate({ messages, responseFormat, temperature }: ProviderGenerateInput, { signal }) {
            const response = await client.chat.completions.create({
                model: opts.model,
                stream: false,
                messages: toUpstreamMessages(messages),
                ...(typeof temperature === 'number' ? { temperature } : {}),
                ...(responseFormat?.type === 'json_object'
                    ? { response_format: { type: 'json_object' } }
                    : {}),
            },
                { signal }
            );

            const content = response.choices?.[0]?.message?.content;

            if (typeof content === 'string' && content.trim()) return content;

            const err = new Error('DeepSeek generate returned empty content');
            (err as any).code = `UPSTREAM_EMPTY_CONTENT`;

            throw err;
        },
        /** 流式生成 用于最终答辩 */
        async *stream({ messages, temperature }: ProviderStreamInput, { signal }) {
            const stream = await client.chat.completions.create(
                {
                    model: opts.model,
                    stream: true,
                    messages: toUpstreamMessages(messages),
                    ...(typeof temperature === 'number' ? { temperature } : {}),
                    // messages: [{ role: 'user', content: messages }]
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