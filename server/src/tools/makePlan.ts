import type { ToolDefinition } from './types';

const readGoal = (args: Record<string, unknown>) => {
    const value = args['goal'];

    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`goal must be a non-empty string`);
    };

    return value.trim();
};

const readConstraints = (args: Record<string, unknown>) => {
    const value = args['constraints'];

    if (!Array.isArray(value)) return [] as string[];

    return value.filter((item): item is string => {
        return typeof item === 'string' && item.trim().length > 0;
    })
};

const readMaxSteps = (args: Record<string, unknown>) => {
    const raw = args['maxSteps'];

    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return 5; // 默认值
    }

    return Math.min(Math.max(Math.floor(raw), 3), 8); // 限制在 3-8 之间的整数
};

const inferFocus = (goal: string) => {
    const text = goal.toLocaleLowerCase();

    if (text.includes('server') || text.includes('后端') || text.includes('接口') || text.includes('api')) {
        return 'server'
    };

    if (text.includes('web') || text.includes('ui') || text.includes('frontend') || text.includes('前端') || text.includes('界面') || text.includes('用户体验') || text.includes('交互')) {
        return 'web'
    };

    return 'general'
};

export const createMakePlanTool = (): ToolDefinition => {
    return {
        name: 'make_plan',
        description: '围绕一个目标生成分步计划，适合任务拆分，学习计划，实现方案',
        inputSchema: {
            type: 'object',
            properties: {
                goal: {
                    type: 'string',
                    description: '期望完成的目标'
                },
                constraints: {
                    type: 'array',
                    description: '制定计划时需要考虑的约束条件',
                    items: { type: 'string' }
                },
                maxSteps: {
                    type: 'number',
                    description: '最多输出多少步 默认5步',
                }
            },
            required: ['goal'],
            additionalProperties: false
        },
        async execute(args) {
            try {
                const goal = readGoal(args);
                const constraints = readConstraints(args);
                const maxSteps = readMaxSteps(args);
                const focus = inferFocus(goal);

                // 根据目标内容推断关注点，帮助生成更有针对性的计划步骤
                const baseSteps = [
                    {
                        title: '确认目标与输入边界',
                        purpose: '先明确要交付什么、依赖什么、暂时不做什么'
                    },
                    {
                        title: '拆分核心模块',
                        purpose: '把目标拆分成最小可落地的子任务，避免一把梭'
                    },
                    {
                        title: '完成主链路实现',
                        purpose: '优先打通最核心的 happy path，保证整体可行'
                    },
                    {
                        title: '补齐失败兜底',
                        purpose: '把异常、空结果、超时等情况收住'
                    },
                    {
                        title: '验证与回归',
                        purpose: '通过渐进式测试确认功能真实可用'
                    }
                ];

                // 根据不同的关注点调整步骤的侧重点和描述，帮助生成更符合预期的计划内容
                const focusHint = 
                    focus === 'server'
                        ? '重点关注接口契约、编排链路、异常处理和日志'
                        : focus === 'web'
                            ? '重点关注界面布局、交互设计、用户体验和性能、状态管理、组件展示和用户反馈'
                            : '重点关注任务拆分、交付物料和验证方式';
                
                const steps = baseSteps.slice(0, maxSteps)
                    .map((step,index) => ({
                        step: index + 1,
                        title: step.title,
                        purpose: step.purpose,
                        deliverable: `${step.title}的可验证结果`
                    }));

                return {
                    ok: true,
                    data: {
                        goal, 
                        focusHint,
                        constraints,
                        steps,
                        risks: [
                            '步骤拆分过粗会导致执行时重新返工',
                            '过早考虑边界情况可能导致过度设计',
                            '没有明确交付物可能导致执行时走偏',
                            '未定义验证标准会让计划看起来完成但实际上不可用'
                        ]
                    }
                }

            } catch (error: any) {
                return {
                    ok: false,
                    error: typeof error?.message === 'string'
                        ? error.message
                        : 'make_plan failed'
                }
            }
        }
    }
}