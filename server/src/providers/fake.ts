import type { Provider } from './types';

/**
 * Week1：假流式输出（用于先把 SSE + Abort + UI 状态跑通）
 * 优点：不依赖外部网络与 key，验收最稳定。
 */
export function createFakeProvider(): Provider {
    return {
        name: 'fake',
        model: 'fake-model',
        async *stream({ message }, { signal }) {
            const answer = `你说的是：${message}\n(Week1 fake stream)\n`;

            for (let i = 0; i < answer.length; i += 3) {
                // console.log('test=>', i, signal.aborted);
                if (signal.aborted) {
                    // 用于验收：确认服务端收到 stop 后，生成逻辑确实停了
                    console.log("[fake] aborted, stop streaming");
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 40)); // 模拟网络延迟
                yield answer.slice(i, i + 3);
            };
        }
    }
}