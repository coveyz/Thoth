import type { ToolDefinition } from './types';


const readTextArg = (args: Record<string, unknown>, key: string) => {
    const value = args[key];

    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${key} must be a non-empty string`);
    };

    return value.trim();
};

/** 找到看起来像待办事项的文本 */
const looksLikeTodo = (line: string) => {
    return (
        /^[-*]\s+/.test(line) ||
        /^\d+[\.\)]\s+/.test(line) ||
        /\b(todo|fix|implement|refactor)\b/i.test(line) ||
        /(待办|需要|应该|实现|修复|补充|优化|完成)/.test(line)
    );
};

/** 首行文本规范化 ，去除开头的符号和空白字符 */
const normalizeLine = (line: string) => {
    return line.replace(/^[\-\*\d\.\)\]\s]+/, '').trim();
};

/** 创建提取待办事项的工具 - 将一段文本里的任务项抽取出来， 做成结构化结果 */
export const createExtractTodosTool = (): ToolDefinition => {
    return {
        name: 'extract_todos',
        description: '从文本中提取待办事项，适合处理会议记录、需求说明、任务清单',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: '需要提取待办的原始文本'
                }
            },
            required: ['text'],
            additionalProperties: false
        },
        async execute(args) {
            try {
                const text = readTextArg(args, 'text');
                
                // 将文本按行或标点符号分割，去除空白字符，得到候选待办事项
                const rawCandidates = text
                    .split(/\n|[。！？!?]/)
                    .map((item) => item.trim())
                    .filter(Boolean);

                // 通过规则过滤出看起来像待办事项的文本，生成结构化的待办列表
                const todos = rawCandidates
                    .filter((item) => looksLikeTodo(item))
                    .map((item, index) => ({
                        id: `todo-${index + 1}`,
                        text: normalizeLine(item)
                    }))
                    .filter((item) => item.text.length > 0);
                
                // 如果没有明显的待办事项，返回前几个文本片段作为备选，保证结果不为空
                const fallbackTodos = 
                    todos.length > 0
                        ? todos
                        : rawCandidates.slice(0, 5).map((item, index) => ({
                            id: `todo-${index + 1}`,
                            text: normalizeLine(item)
                        }));
                
                return {
                    ok: true,
                    data: {
                        total: fallbackTodos.length,
                        items: fallbackTodos
                    }
                }
            } catch (error: any) {
                return {
                    ok: false,
                    error: typeof error?.message === 'string'
                        ? error.message
                        : 'extract_todos failed'
                }
            }
        }
    }
}