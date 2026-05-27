
import type { ToolDefinition } from './types';

const readTextArg = (args: Record<string, unknown>, key: string) => {
    const value = args[key];

    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${key} must be a non-empty string`);
    };

    return value.trim();
};

const readMaxPoints = (args: Record<string, unknown>, key: string) => {
    const raw = args[key];

    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return 3;
    };

    return Math.min(Math.max(Math.floor(raw), 1), 8); // 限制在 1-8 之间的整数，默认3
};


/** 把长文本 压成短摘要 和 若干bullet */
export const createSummarizeTool = (): ToolDefinition => {
    return {
        name: 'summarize',
        description: '对文本做简要总结，输出短摘要和关键要点列表',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: '要总结的原始文本'
                },
                maxPoints: {
                    type: 'number',
                    description: '最多输出多少个关键要点 默认 3',
                }
            },
            required: ['text'],
            additionalProperties: false
        },
        async execute(args) {
            try {
                const text = readTextArg(args, 'text');
                const maxPoints = readMaxPoints(args, 'maxPoints');

                const segments = text
                    .split(/\n|[。！？!?]/)
                    .map((item) => item.trim())
                    .filter((item) => item.length >= 6); // 过滤掉过短的片段，避免噪音


                const uniqueSegments = Array.from(new Set(segments)); // 去重
                const bullets = uniqueSegments.slice(0, maxPoints); // 取前几个作为要点，简单粗暴但有效

                const shortSummary = bullets.length > 0
                    ? bullets.join('；')
                    : text.slice(0, 120); // 如果没有明显要点，直接截取开头作为简要摘要

                return {
                    ok: true,
                    data: {
                        shortSummary,
                        bullets,
                        originalLength: text.length
                    }
                }
            } catch (error: any) {
                return {
                    ok: false,
                    error: typeof error?.message === 'string'
                        ? error.message
                        : 'summarize failed'
                }
            };
        }
    }
}