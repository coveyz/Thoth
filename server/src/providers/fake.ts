import type { Provider, ProviderMessage, ProviderStreamInput, ProviderGenerateInput } from './types';

const sleep = (ms: number) => {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const getLastUserMessage = (message: ProviderMessage[]) => {
    const reversed = [...message].reverse();
    return reversed.find(item => item.role === 'user')?.content ?? '';
};

const buildFakeFinalAnswer = (messages: ProviderMessage[]) => {
    const lastUser = getLastUserMessage(messages);

    if (lastUser.includes('工具结果')) {
        return `我已经读取了工具结果，并基于工具结果生成最终回答。\n\n${lastUser}\n\n(Week2 fake final answer)\n`;
    };

    return `这是不经过工具的最终回答：${lastUser}\n\n(Week2 fake direct answer)\n`;
};

const detectDecision = (message: string) => {
    const text = message.toLocaleLowerCase();

    if (text.includes('todo') || text.includes('待办') || text.includes('提取任务')) {
        return {
            mode: 'tool',
            toolName: 'extract_todos',
            arguments: { text: message },
            reason: '用户在请求提取待办事项'
        };
    };

    if (text.includes('总结') || text.includes('摘要') || text.includes('summarize')) {
        return {
            mode: 'tool',
            toolName: 'summarize',
            arguments: { text: message, maxPoints: 3 },
            reason: '用户在请求总结文本'
        };
    };

    if (text.includes('计划') || text.includes('拆分') || text.includes('方案')) {
        return {
            mode: 'tool',
            toolName: 'make_plan',
            arguments: { goal: message, maxSteps: 5 },
            reason: '用户在请求制定计划'
        };
    };

    return {
        mode: 'direct',
        reply: `这是 fake provider 的直接回答草稿：${message}`,
        reason: '该问题不需要工具'
    }
};

export function createFakeProvider(): Provider {
    return {
        name: 'fake',
        model: 'fake-model',
        async generate({ messages, responseFormat }: ProviderGenerateInput) {
            const lastUser = getLastUserMessage(messages);

            if (responseFormat?.type === 'json_object') {
                return JSON.stringify(detectDecision(lastUser));
            };

            return `fake generate: ${lastUser}`;
        },
        async *stream({ messages }: ProviderStreamInput, { signal }) {
            // const answer = `你说的是：${message}\n(Week1 fake stream)\n`;
            const answer = buildFakeFinalAnswer(messages);

            for (let i = 0; i < answer.length; i += 4) {
                if (signal.aborted) {
                    console.log("[fake] aborted, stop streaming");
                    return;
                }
                // await new Promise(resolve => setTimeout(resolve, 40)); // 模拟网络延迟

                await sleep(40);
                yield answer.slice(i, i + 4);
            };
        }
    }
}