import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "../src/app";
import { createTestEnv } from "./helpers/createTestEnv";
import { parseSSE, parseSSEJson } from "./helpers/parseSSE";

type StartPayload = {
    requestId: string;
    model: string;
};

type DonePayload = {
    ok: boolean;
    reason?: string;
};

type ErrorPayload = {
    code: string;
    message: string;
    requestId: string;
};

type ToolCallPayload = {
    name: string;
    arguments: Record<string, unknown>;
    reason?: string;
};

type ToolResultPayload = {
    name: string;
    ok: boolean;
    result: {
        total: number;
        items: Array<{ id: string, text: string }>
    };
};

// 每一个测试 都会固定 Env 创建 App
const app = createApp(createTestEnv());

describe('Thoth API regression', () => {
    /** 
     * HEALTH-01: 验证 Express App 已成功创建，健康检查路由能够返回版本信息。
     */
    it('HEALTH-01 returns server health information', async () => {
        const response = await request(app)
            .get('/healthz')
            .expect(200);

        expect(response.body).toEqual({
            ok: true,
            version: '0.1.0'
        });

        // app.disable('x-powered-by') 应当继续生效。
        expect(response.headers['x-powered-by']).toBeUndefined();
    });

    /**
     * CHAT-01: 
     * 显式设置：
     * toolChoice: none -> 不允许工具调用
     * rag: false       -> 不进入 RAG
     *
     * 因此事件只能是 start、delta 和 done。
     */
    it('CHAT-01 streams a direct Fake Provider answer', async () => {
        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '你好，请介绍一下自己',
                toolChoice: 'none',
                rag: false,
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const events = parseSSE(response.text);
        const eventNames = events.map(e => e.name);

        // 第一个业务事件必须是 start，
        // 最后一个业务事件必须是 done。
        expect(eventNames[0]).toBe('start');
        expect(eventNames.at(-1)).toBe('done');
        // 流式回答必须至少包含一个 delta。
        expect(eventNames).toContain('delta');
        // 当前场景明确禁用了 Tool 和 RAG。
        expect(eventNames).not.toContain('tool_call');
        expect(eventNames).not.toContain('tool_result');
        expect(eventNames).not.toContain('sources');
        expect(eventNames).not.toContain('error');

        const startEvent = events.find(event => event.name === 'start');
        const doneEvent = events.find(event => event.name === 'done');

        expect(startEvent).toBeDefined();
        expect(doneEvent).toBeDefined();

        const start = parseSSEJson<StartPayload>(startEvent!);
        const done = parseSSEJson<DonePayload>(doneEvent!);

        // fake-model 证明测试没有误用真实 Provider。
        expect(start.requestId).toBeTruthy();
        expect(start.model).toBe('fake-model');
        expect(done.ok).toBe(true);
    });

    /**
     *  TOOL-01:
     *  Fake Provider 检测到“提取待办”关键词后，应稳定选择 extract_todos。
     */
    it('TOOL-01 calls extract_todos in auto mode', async () => {
        const message = '请提取待办：修复登录问题，补充测试，更新 README';

        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message,
                toolChoice: 'auto',
                rag: false,
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const events = parseSSE(response.text);
        const eventNames = events.map(e => e.name);

        const toolCallIndex = eventNames.indexOf('tool_call');
        const toolResultIndex = eventNames.indexOf('tool_result');
        const firstDeltaIndex = eventNames.indexOf('delta');
        const doneIndex = eventNames.indexOf('done');

        // 先确认各个关键事件确实存在
        expect(toolCallIndex).toBeGreaterThan(-1);
        expect(toolResultIndex).toBeGreaterThan(-1);
        expect(firstDeltaIndex).toBeGreaterThan(-1);
        expect(doneIndex).toBeGreaterThan(-1);

        // 再验证工具链路的执行顺序
        expect(toolCallIndex).toBeLessThan(toolResultIndex);
        expect(toolResultIndex).toBeLessThan(firstDeltaIndex);
        expect(firstDeltaIndex).toBeLessThan(doneIndex);

        const toolCallEvent = events[toolCallIndex];
        const toolResultEvent = events[toolResultIndex];

        const toolCall = parseSSEJson<ToolCallPayload>(toolCallEvent);
        const toolResult = parseSSEJson<ToolResultPayload>(toolResultEvent);

        expect(toolCall.name).toBe('extract_todos');
        expect(toolCall.arguments).toEqual({ text: message });
        expect(toolCall.reason).toBeTruthy();

        expect(toolResult.name).toBe('extract_todos');
        expect(toolResult.ok).toBe(true);
        expect(toolResult.result.total).toBeGreaterThan(0);
        expect(toolResult.result.items.length).toBeGreaterThan(0);
    });

    /**
     * ERROR-01:
     * message 缺失时，应在选择 Provider 和发送 start 之前, 返回 BAD_REQUEST SSE事件
     */
    it('ERROR-01 returns BAD_REQUEST when message is missing', async () => {
        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({})
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const events = parseSSE(response.text);
        const eventNames = events.map(e => e.name);

        // 当前实现中，参数校验发生在 start 事件之前。所以非法请求应该只产生一个 error 事件。
        expect(eventNames).toEqual(['error']);

        const error = parseSSEJson<ErrorPayload>(events[0]);

        expect(error.code).toBe('BAD_REQUEST');
        expect(error.message).toBe('message is required');
        expect(error.requestId).toBeTruthy();
    });

    /** 
     * ERROR-02:
     * 应当和完全缺失的 message 使用相同错误协议
     */
    it('ERROR-02 returns BAD_REQUEST when message is blank', async () => {
        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '   ',
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const events = parseSSE(response.text);
        const eventNames = events.map(e => e.name);

        // 参数校验发生在 start 之前，因此空白 message 只返回 error。
        expect(eventNames).toEqual(['error']);

        const error = parseSSEJson<ErrorPayload>(events[0]);

        expect(error.code).toBe('BAD_REQUEST');
        expect(error.message).toBe('message is required');
        expect(error.requestId).toBeTruthy();
    });

    /**
     * CONTROL-02:
     * Fake Provider 产生第一个 delta 前会等待约 40ms。 首token 超时设置为 1ms 后
     * 
     * start
     * → 启动 1ms 首 Token 定时器
     * → 定时器先于 Fake Provider 返回
     * → error: FIRST_TOKEN_TIMEOUT
     */
    it('CONTROL-02 returns FIRST_TOKEN_TIMEOUT before the first delta', async () => {
        const timeoutApp = createApp(createTestEnv({
            THOTH_FIRST_TOKEN_TIMEOUT_MS: 1,
            THOTH_OVERALL_TIMEOUT_MS: 5000,
        }));

        const response = await request(timeoutApp)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '测试首 Token 超时',
                toolChoice: 'none',
                rag: false,
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const events = parseSSE(response.text);
        const eventNames = events.map(e => e.name);

        // 首 Token 超时前已经发送了 start，但还没有发送 delta
        expect(eventNames).toEqual(['start', 'error']);
        expect(eventNames).not.toContain('delta');
        expect(eventNames).not.toContain('done');

        const start = parseSSEJson<StartPayload>(events[0]);
        const error = parseSSEJson<ErrorPayload>(events[1]);

        expect(start.model).toBe('fake-model');
        expect(error.code).toBe('FIRST_TOKEN_TIMEOUT');

        //  start 和 error 必须属于同一次请求，
        expect(error.requestId).toBe(start.requestId);
    });

    /** 
     * CONTROL-03:
     * 整体超时覆盖完整请求生命周期
     * 包括 工具决策，RAG检索，最总答案
     * 
     * 设置为 1ms 后，它会先于 Fake Provider
     * 约 40ms 的第一次输出触发。
     */
    it('CONTROL-03 returns OVERALL_TIMEOUT when the whole request takes too long', async () => {
        const timeoutApp = createApp(createTestEnv({
            THOTH_FIRST_TOKEN_TIMEOUT_MS: 1000,
            THOTH_OVERALL_TIMEOUT_MS: 1,
        }));

        const response = await request(timeoutApp)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '测试整体超时',
                toolChoice: 'none',
                rag: false,
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const events = parseSSE(response.text);
        const eventNames = events.map(e => e.name);

        // 首 Token 超时前已经发送了 start，但还没有发送 delta
        expect(eventNames).toEqual(['start', 'error']);
        expect(eventNames).not.toContain('delta');
        expect(eventNames).not.toContain('done');

        const start = parseSSEJson<StartPayload>(events[0]);
        const error = parseSSEJson<ErrorPayload>(events[1]);

        expect(start.model).toBe('fake-model');
        expect(error.code).toBe('OVERALL_TIMEOUT');

        //  start 和 error 必须属于同一次请求，
        expect(error.requestId).toBe(start.requestId);
    })
})