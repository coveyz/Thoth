import { prettyJson } from '../lib/json';

import type { ProviderMessage } from '../providers/types';
import type { ToolDefinition, ToolName } from '../tools/types';

/** 定义 请求里工具调用的控制策略 */
export type ToolChoice = 'auto' | 'none' | ToolName;

/** 提供 模型角色阶段阅读 */
const renderToolDocs = (tools: ToolDefinition[]) => {
    return tools.map((tool, index) => {
        return [
            `${index + 1}.${tool.name}`,
            `description: ${tool.description}`,
            `inputSchema: ${JSON.stringify(tool.inputSchema)}`,
        ].join('\n');
    })
        .join('\n\n');
};

/** 
 * 通过 system 将输出格式 卡死 , 构建工具理由prompt
 */
export const buildToolDecisionMessages = (
    userMessage: string,
    tools: ToolDefinition[],
    toolChoice: ToolChoice
): ProviderMessage[] => {
    const choiceRule =
        toolChoice === 'none'
            ? '本轮禁止调用工具 你必须输出direct'
            : toolChoice === 'auto'
                ? '本轮你自行判断是否需要调用工具，但最多只允许调用一个'
                : `本轮必须调用工具 ${toolChoice}`;

    return [
        {
            role: 'system',
            content: [
                '你是 Thoth 的工具路由',
                '你的职责不是直接长篇回答，而是先决定这轮请求是否需要工具',
                choiceRule,
                '请严格输出一个 JSON 对象，不要输出 markdown 不要输出解释文字',
                'JSON 对象格式如下：',
                '{',
                '  "mode": "direct" | "tool",',
                '  "reason": "简短中文理由",',
                '  "reply": "当 mode=direct 时必填，给用户的简短回答草稿",',
                '  "toolName": "当 mode=tool 时必填",',
                '  "arguments": { "当 mode=tool 时必填，必须符合工具参数结构" },',
                '}',
                "可用工具如下",
                renderToolDocs(tools)
            ].join('\n')
        },
        {
            role: 'user',
            content: userMessage
        }
    ]
};

/** 用在不走工具的路径上 */
export const buildDirectAnswerMessages = (
    userMessage: string,
    directReply?: string
): ProviderMessage[] => {
    const messages: ProviderMessage[] = [
        {
            role: 'system',
            content: [
                '你是 Thoth',
                '请用中文回答用户的问题',
                '回答要简洁、具体、可信，不要胡编',
                '如果信息不足，要确切说明边界'
            ].join('\n')
        },
        {
            role: 'user',
            content: userMessage
        }
    ];

    // console.log('buildDirectAnswerMessages', { userMessage, directReply });

    if (directReply && directReply.trim()) {
        messages.push({
            role: 'assistant',
            content: `前一阶段拟定的回答草稿是: ${directReply.trim()}`
        });
        messages.push({
            role: 'user',
            content: '基于上面的回答草稿，输出最终回答'
        })
    };

    return messages;
}

/** 成功执行后， 重新组织 */
export const buildToolAnswerMessages = (params: {
    userMessage: string;
    toolName: ToolName;
    toolReason: string;
    toolArgs: Record<string, unknown>;
    toolResult: unknown
}): ProviderMessage[] => {
    return [
        {
            role: 'system',
            content: [
                '你是 Thoth',
                '现在已经拿到了工具执行结果',
                '请优先依据工具结果回答，不再忽略工具结果',
                '请用中文输出最终回答，回答要自然、具体、可信',
            ].join('\n')
        },
        {
            role: 'user',
            content: params.userMessage
        },
        {
            role: 'assistant',
            content: `我决定调用工具 ${params.toolName} 来帮助回答，理由是 ${params.toolReason}，`
        },
        {
            role: 'user',
            content: [
                `工具 ${params.toolName} 的入参如下`,
                prettyJson(params.toolArgs),
                '',
                '工具结果如下：',
                prettyJson(params.toolResult),
                '',
                '请只基于这些信息给出最终回答。'
            ].join('\n')
        }
    ]
};

/** 如果工具执行失败，就明确告诉模型“工具失败了 */
export const buildToolErrorFallbackMessages = (params: {
    userMessage: string;
    toolName: ToolName;
    toolReason: string;
    toolArgs: Record<string, unknown>;
    toolError: string;
}): ProviderMessage[] => {
    return [
        {
            role: 'system',
            content: [
                '你是 Thoth',
                '本轮工具执行失败',
                '请不要胡编工具结果，直接基于以下信息回答',
                '请直接基于已有上下文给出一个保守回答，并明确说明工具失败。',
            ].join('\n')
        },
        {
            role: 'user',
            content: params.userMessage
        },
        {
            role: 'assistant',
            content: `我本想调用工具 ${params.toolName}，原因：${params.toolReason}`
        },
        {
            role: 'user',
            content: [
                `工具 ${params.toolName || ''} 的入参如下`,
                prettyJson(params.toolArgs),
                '',
                `但工具执行失败了，错误信息如下：${params.toolError}`,
                '请在最终回答中如实说明这一点。'
            ].join('\n')
        }
    ]
};