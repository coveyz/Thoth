import type { Provider } from './types';


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
        async *stream({ message }, { signal }) {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${opts.apiKey}`,
                },
                body: JSON.stringify({
                    model: opts.model,
                    stream: true,
                    message: [{ role: 'user', content: message }]
                }),
                signal
            });

            // HTTP 层错误要抛出去， 路由统一发 error 事件
            if (!resp.ok) {
                const text = await resp.text().catch(() => '');
                const err = new Error(`Upstream HTTP ${resp.status}: ${text.slice(0, 300)}`);
                (err as any).code = `UPSTREAM_HTTP_${resp.status}`;
                throw err;
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
                if (!done) break;

                buffer += decoder.decode(value, { stream: true });
                // 上游 SSE 也是以空行分隔事件的，我们按行处理

                let idx: number;

                while ((idx = buffer.indexOf("\n\n")) !== -1) {
                    const raw = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);

                    const lines = raw.split("\n");
                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;

                        const data = line.slice(5).trimStart();
                        if (data === '[DONE]') return;

                        try {
                            const json = JSON.parse(data);
                            const delta: string | undefined = json.choices?.[0]?.delta?.content;
                            if (typeof delta === 'string' && delta.length > 0) {
                                yield delta;
                            };
                        } catch (error) {
                            // 上游数据格式不对，记录日志但不抛错
                            console.warn('Failed to parse upstream data as JSON:', { data, error });
                        }

                    }
                };

            };

        }
    }
}