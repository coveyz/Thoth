import { parseModelJson } from '../lib/json';
import {
    buildToolDecisionMessages,
    buildToolAnswerMessages,
    buildDirectAnswerMessages,
    buildToolErrorFallbackMessages
} from '../prompts/system';
import { getTool, isToolName, listTools } from '../tools';

import type { ToolChoice } from '../prompts/system';
import type { Provider, ProviderMessage } from '../providers/types';
import type { ToolDecision, ToolName } from '../tools/types';



type PrepareAssistantTurnInput = {
    provider: Provider;
    userMessage: string;
    requestId: string;
    signal: AbortSignal;
    toolChoice: ToolChoice;
};

type ToolCallInfo = {
    name: ToolName;
    arguments: Record<string, unknown>;
    reason: string;
};

export type PrepareAssistantTurnOutput = {
    finalMessages: ProviderMessage[];
    toolCall?: ToolCallInfo;
    toolResult?: unknown;
    toolError?: string;
};

const toRecord = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {}
    };

    return value as Record<string, unknown>;
};

const normalizeToolDecision = (
    parsed: ToolDecision | null,
    toolChoice: ToolChoice
): ToolDecision => {
    if (toolChoice === 'none') {
        return {
            mode: 'direct',
            reason: '根据控制策略，本轮禁止调用工具',
            reply: ''
        };
    };

    if (!parsed) {
        return {
            mode: 'direct',
            reason: '无法解析工具决策的 JSON 输出',
            reply: ''
        }
    };

    // 强制指定工具时，优先尊重服务端策略
    if (toolChoice !== 'auto') {
        return {
            mode: 'tool',
            toolName: toolChoice,
            arguments: toRecord(parsed.arguments),
            reason:
                typeof parsed.reason === 'string' && parsed.reason.trim()
                    ? parsed.reason
                    : `forced tool: ${toolChoice}`,
        }
    };

    if (parsed.mode === 'tool' && isToolName(parsed.toolName)) {
        return {
            mode: 'tool',
            toolName: parsed.toolName,
            arguments: toRecord(parsed.arguments),
            reason:
                typeof parsed.reason === 'string' && parsed.reason.trim()
                    ? parsed.reason
                    : `model choose tool`,
        }
    };

    return {
        mode: 'direct',
        reply: typeof parsed.reply === 'string' ? parsed.reply : '',
        reason:
            typeof parsed.reason === 'string' && parsed.reason.trim()
                ? parsed.reason
                : 'model choose direct',
    };
};

export const prepareAssistantTurn = async (
    input: PrepareAssistantTurnInput
): Promise<PrepareAssistantTurnOutput> => {
    if (input.toolChoice === 'none') {
        return {
            finalMessages: buildDirectAnswerMessages(input.userMessage)
        }
    };

    // 让模型输出 结构化 ToolDecision
    const rawDecision = await input.provider.generate(
        {
            messages: buildToolDecisionMessages(
                input.userMessage,
                listTools(),
                input.toolChoice
            ),
            responseFormat: { type: 'json_object' },
            temperature: 0 // 决策阶段不需要创造力，降低温度可以让输出更稳定
        },
        {
            signal: input.signal
        }
    );

    const parsedDecision = parseModelJson<ToolDecision>(rawDecision);
    const decision = normalizeToolDecision(parsedDecision, input.toolChoice);

    if (decision.mode === 'direct' || !decision.toolName) {
        return {
            finalMessages: buildDirectAnswerMessages(input.userMessage, decision.reply)
        }
    }

    const tool = getTool(decision.toolName);
    const toolArgs = toRecord(decision.arguments);

    if (!tool) {
        return {
            toolCall: {
                name: decision.toolName,
                arguments: toolArgs,
                reason: decision.reason
            },
            toolError: `tool not found: ${decision.toolName}`,
            finalMessages: buildToolErrorFallbackMessages({
                userMessage: input.userMessage,
                toolName: decision.toolName,
                toolReason: decision.reason,
                toolArgs,
                toolError: `tool not found: ${decision.toolName}`
            })
        }
    };

    const result = await tool.execute(toolArgs, {
        requestId: input.requestId,
        now: new Date().toISOString()
    });

    if (!result.ok) {
        return {
            toolCall: {
                name: decision.toolName,
                arguments: toolArgs,
                reason: decision.reason
            },
            toolError: result.error,
            finalMessages: buildToolErrorFallbackMessages({
                userMessage: input.userMessage,
                toolName: decision.toolName,
                toolReason: decision.reason,
                toolArgs,
                toolError: result.error
            })
        }
    }


    return {
        toolCall: {
            name: decision.toolName,
            arguments: toolArgs,
            reason: decision.reason
        },
        toolResult: result.data,
        finalMessages: buildToolAnswerMessages({
            userMessage: input.userMessage,
            toolName: decision.toolName,
            toolReason: decision.reason,
            toolArgs,
            toolResult: result.data
        })
    }

};