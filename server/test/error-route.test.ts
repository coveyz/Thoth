import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { parseSSE, parseSSEJson } from "./helpers/parseSSE";
import { createApp } from "../src/app";
import { createTestEnv } from "./helpers/createTestEnv";
import { AppError } from "../src/lib/error";


/**
 * 测试控制器， vi.hoisted 确保对象在mock工厂执行前创建
 */
const controls = vi.hoisted(() => {
    return {
        providerFailure: null as unknown,
        ragFailure: null as unknown,
    }
});

/**
 * 替换 ChatProvider 工厂
 *  - 这个 Fake Provider 不调用任何真实 API。
 */
vi.mock('../src/providers/index.ts', () => {
    return {
        getProvider: () => ({
            name: 'error-test-provider',
            model: 'error-test-model',
            async generate() {
                if (controls.providerFailure) throw controls.providerFailure;

                return JSON.stringify({
                    mode: 'direct',
                    reply: 'test reply',
                    reason: 'test decision'
                })
            },
            async *stream() {
                if (controls.providerFailure) throw controls.providerFailure;

                yield 'test delta'
            }
        })
    }
});

/**
 * 替换 RagOrchestrator 工厂
 *  - 已有 rag.test.ts 负责验证真实检索流程，
 */
vi.mock('../src/orchestrators/ragOrchestrators.ts', () => {
    return {
        prepareRagTurn: async () => {
            if (controls.ragFailure) throw controls.ragFailure;

            return {
                sources: [],
                finalMessages: []
            }
        }
    }
})


type ErrorPayload = {
    code: string;
    message: string;
    requestId: string;
};

/**
 * 从 SSE 中读取唯一错误的事件
 *  - 不存在 expect 会先给出清楚的测试失败信息。
 */
function readErrorPayload(responseTest: string): { eventNames: string[]; error: ErrorPayload } {
    const events = parseSSE(responseTest);
    const eventNames = events.map(e => e.name);

    const errorEvent = events.find(e => e.name === 'error');
    expect(errorEvent).toBeDefined();

    return {
        eventNames,
        error: parseSSEJson<ErrorPayload>(errorEvent!)
    }
};

const app = createApp(createTestEnv());

describe('chat error boundary', () => {
    // 防止 前一条测试 留下失败的状态 污染
    beforeEach(() => {
        controls.providerFailure = null;
        controls.ragFailure = null;
    });

    /**
     * ERROR-03: 模拟 Provider 层已经把 SDK 异常
     *  - 统一 PROVIDER_ERROR
     */
    it('ERROR-03 returns a safe PROVIDER_ERROR', async () => {
        const original = new Error('401 invalid secret api key');

        controls.providerFailure = new AppError('PROVIDER_ERROR', { cause: original });

        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '触发 Provider 错误',
                toolChoice: 'none',
                rag: false,
            })
            .expect(200)
            .expect(
                'Content-Type',
                /text\/event-stream/
            );

        const { eventNames, error } = readErrorPayload(response.text);
        expect(eventNames).toEqual(['start', 'error']);
        expect(error.code).toBe('PROVIDER_ERROR');
        expect(error.message).toBe('模型服务暂时不可用，请稍后重试');
        expect(error.requestId).toBeTruthy();

        expect(response.text).not.toContain('invalid secret api key');
    });

    /** 
     * ERROR-04: 模拟 RAG/EMbedding 边界排除
     */
    it('ERROR-04 returns a safe EMBEDDING_ERROR', async () => {
        const original = new Error('embedding upstream rejected api key');
        controls.ragFailure = new AppError('EMBEDDING_ERROR', { cause: original });

        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '触发 Embedding 错误',
                toolChoice: 'none',
                rag: true,
            })
            .expect(200)
            .expect(
                'Content-Type',
                /text\/event-stream/
            );

        const { eventNames, error } = readErrorPayload(response.text);
        expect(eventNames).toEqual(['start', 'error']);
        expect(error.code).toBe('EMBEDDING_ERROR');
        expect(error.message).toBe('知识库检索暂时不可用，请稍后重试');
        expect(error.requestId).toBeTruthy();

        expect(response.text).not.toContain('embedding upstream rejected');
    });

    /**
     * ERROR-05:  未经过归一化的未知异常必须回退 INTERNAL_ERROR
     */
    it('ERROR-05 hides unknown internal error details', async () => {
        controls.providerFailure = new Error('database password is secret');

        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '触发未知错误',
                toolChoice: 'none',
                rag: false,
            })
            .expect(200)
            .expect(
                'Content-Type',
                /text\/event-stream/
            );

        const { eventNames, error } = readErrorPayload(response.text);
        expect(eventNames).toEqual(['start', 'error']);
        expect(error.code).toBe('INTERNAL_ERROR');
        expect(error.message).toBe('服务暂时不可用，请稍后重试');
        expect(error.requestId).toBeTruthy();

        expect(response.text).not.toContain('database password is secret');
    });
})

