import type { Provider, ProviderGenerateInput, ProviderMessage, ProviderStreamInput } from './types';

const toUpstreamMessages = (messages: ProviderMessage[]) => {
    return messages.map((message) => {
        return {
            role: message.role,
            content: message.content,
        }
    });
};

const readUpstreamError = async (resp: Response) => {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Upstream HTTP ${resp.status}: ${text.slice(0, 300)}`);
    (err as any).code = `UPSTREAM_HTTP_${resp.status}`;

    throw err;
}

/**
 * OpenAI-compatible Chat Completions 流式接口（DeepSeek 也兼容）。
 * 关键点：
 * - 上游也是 SSE：逐行 data: ...，以 data: [DONE] 结束
 * - 我们把上游的增量 token 转成自己的 delta 事件发给前端
 */
export function createOpenAICompatProvider(opts: {
    baseUrl: string;
    apiKey: string;
    model: string;
}): Provider {
    const baseUrl = opts.baseUrl.replace(/\/+$/, ''); // 去除末尾斜杠
    const url = `${baseUrl}/v1/chat/completions`;

    return {
        name: 'openai-compat',
        model: opts.model,
        async generate(
            { messages, responseFormat, temperature }: ProviderGenerateInput,
            { signal }
        ) {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${opts.apiKey}`,
                },
                signal,
                body: JSON.stringify({
                    model: opts.model,
                    stream: false,
                    messages: toUpstreamMessages(messages),
                    ...(typeof temperature === 'number' ? { temperature } : {}),
                    ...(responseFormat?.type === 'json_object'
                        ? { response_format: { type: 'json_object' } }
                        : {}
                    )
                })
            });

            if (!resp.ok) {
                await readUpstreamError(resp);
            };

            const json = await resp.json();
            const content = json?.choices?.[0]?.message?.content;

            if (typeof content === 'string' && content.trim()) return content;

            const err = new Error('Upstream generate returned empty content');
            (err as any).code = `UPSTREAM_EMPTY_CONTENT`;
            throw err;
        },
        async *stream({ messages, temperature }: ProviderStreamInput, { signal }) {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${opts.apiKey}`,
                },
                body: JSON.stringify({
                    model: opts.model,
                    stream: true,
                    messages: toUpstreamMessages(messages),
                    ...(typeof temperature === 'number' ? { temperature } : {})
                }),
                signal
            });

            // HTTP 层错误要抛出去， 路由统一发 error 事件
            if (!resp.ok) {
                await readUpstreamError(resp);
            };

            if (!resp.body) {
                const err = new Error(`Upstream response has no body`);
                (err as any).code = `UPSTREAM_NO_BODY`;
                throw err;
            };

            const reader = resp.body.getReader();
            const decoder = new TextDecoder('utf-8');

            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? ''; // 最后一部分可能不完整，保留在 buffer 里

                for (const part of parts) {
                    const lines = part.split('\n');
                    const dataLines = lines
                        .filter((line) => line.startsWith('data:'))
                        .map((line) => line.slice(5).trim());

                    for (const data of dataLines) {
                        if (data === '[DONE]') return;

                        try {
                            const json = JSON.parse(data);
                            const delta = json?.choices?.[0]?.delta?.content;

                            if (typeof delta === 'string' && delta.length > 0) {
                                yield delta;
                            }
                        } catch (error) {
                            // 上游偶尔发脏块直接跳过 不让整条崩
                            console.warn('Failed to parse upstream data as JSON:', { data, error });
                        }
                    }

                }
            };
        }
    }
}