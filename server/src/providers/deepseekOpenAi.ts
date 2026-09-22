import OpenAI from 'openai';

import type { Provider, ProviderGenerateInput, ProviderMessage, ProviderStreamInput } from './types';
import { isAbortError, normalizeError } from '../lib/error';

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
    const client = new OpenAI({
        baseURL: opts.baseUrl.replace(/\/+$/, ''), // 去除末尾斜杠
        apiKey: opts.apiKey.trim(),
    });

    return {
        name: 'deepseek',
        model: opts.model,
        /** 一次性生成 用于工具决策 */
        async generate({ messages, responseFormat, temperature }: ProviderGenerateInput, { signal }) {

            try {
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

                throw new Error('DeepSeek generate returned empty content');
            } catch (error) {
                // 用户 停止或超时 ，都会触发 AbortError
                // AbortError 必须原样抛出
                // 由 ChatRoute 决定它代表停止还是超时
                if (isAbortError(error)) throw error;

                // 其他SDK，网络， 鉴权， 和空内容错误， 统一归类为 PROVIDER_ERROR
                throw normalizeError(error, 'PROVIDER_ERROR')
            }

        },
        /** 流式生成 用于最终答辩 */
        async *stream({ messages, temperature }: ProviderStreamInput, { signal }) {
            try {
                const stream = await client.chat.completions.create(
                    {
                        model: opts.model,
                        stream: true,
                        messages: toUpstreamMessages(messages),
                        ...(typeof temperature === 'number' ? { temperature } : {}),
                    },
                    { signal }
                );

                for await (const chunk of stream) {
                    const delta = chunk.choices?.[0]?.delta?.content;
                    if (typeof delta === 'string' && delta.length > 0) {
                        yield delta;
                    };
                }
            } catch (error: unknown) {
                // 保留中文语意
                if (isAbortError(error)) throw error;
                // 请求建议失败或读流失败， 统一归类为 PROVIDER_ERROR
                throw normalizeError(error, 'PROVIDER_ERROR');
            }

        }
    }
}