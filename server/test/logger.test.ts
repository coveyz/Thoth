import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app';
import { createTestEnv } from './helpers/createTestEnv';
import type { RequestLogEntry } from '../src/lib/logger';


const logs: RequestLogEntry[] = [];

const writeLog = (entry: RequestLogEntry) => {
    logs.push(entry);
};

const app = createApp(createTestEnv(), { writeLog })


describe('structured request logger', () => {
    /**
    * 每条测试开始前清空日志，
    * 防止上一条测试污染当前断言。
    */
    beforeEach(() => {
        logs.length = 0;
    });

    /**
     * OBS-01 / OBS-02
     * 健康检查没有 Chat 业务字段
     */
    it('logs one completed health request', async () => {
        await request(app)
            .get('/healthz')
            .expect(200);

        expect(logs).toHaveLength(1);

        const [entry] = logs;

        expect(entry.level).toBe('info');
        expect(entry.event).toBe('request.completed');
        expect(entry.requestId).toBeTruthy();
        expect(entry.method).toBe('GET');
        expect(entry.path).toBe('/healthz');
        expect(entry.statusCode).toBe(200);
        expect(entry.latencyMs).toBeGreaterThanOrEqual(0);
        expect(entry.outcome).toBe('success');

        expect(Number.isNaN(
            Date.parse(entry.timestamp))
        ).toBe(false);

        /**
         * Health 不经过 Chat Provider。
         */
        expect(entry.provider).toBeUndefined();
        expect(entry.model).toBeUndefined();
        expect(entry.errorCode).toBeUndefined();
    });

    /**
     *  普通 Chat 应记录 Provider、Model 和 RAG 开关
     */
    it('logs a successful direct chat', async () => {
        await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '测试结构化日志',
                toolChoice: 'none',
                rag: false,
            })
            .expect(200);

        expect(logs).toHaveLength(1);
        const [entry] = logs;
        expect(entry.method).toBe('POST');
        expect(entry.path).toBe('/api/chat/stream');
        expect(entry.provider).toBe('fake');
        expect(entry.model).toBe('fake-model');
        expect(entry.rag).toBe(false);
        expect(entry.outcome).toBe('success');
        expect(entry.errorCode).toBeUndefined();
    })

    /**
     * 工具调用成功时记录工具名称，
     * 但整个请求 outcome 仍然是 success。
     */
    it('logs the selected tool name', async () => {
        await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '请提取待办：更新 README',
                toolChoice: 'auto',
                rag: false,
            })
            .expect(200);

        expect(logs).toHaveLength(1);

        const [entry] = logs;

        expect(entry.provider).toBe('fake');
        expect(entry.toolName).toBe('extract_todos');
        expect(entry.outcome).toBe('success');
    });

    /**
     * 参数错误发生在 Provider 选择之前。
     */
    it('logs BAD_REQUEST outcome and error code', async () => {
        await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({})
            .expect(200);

        expect(logs).toHaveLength(1);

        const [entry] = logs;

        expect(entry.rag).toBe(false);
        expect(entry.outcome).toBe('bad_request');
        expect(entry.errorCode).toBe('BAD_REQUEST');
        expect(entry.provider).toBeUndefined();
        expect(entry.model).toBeUndefined();
    });

    /**
    * 首 Token 超时应记录 timeout，
    * 而不是 success、stopped 或 error。
    */
    it('logs FIRST_TOKEN_TIMEOUT', async () => {
        const timeoutLogs:
            RequestLogEntry[] = [];

        const timeoutApp = createApp(
            createTestEnv({
                THOTH_FIRST_TOKEN_TIMEOUT_MS: 1,
                THOTH_OVERALL_TIMEOUT_MS: 5000,
            }),
            {
                writeLog: (entry) => {
                    timeoutLogs.push(entry);
                },
            }
        );

        await request(timeoutApp)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '触发首 Token 超时',
                toolChoice: 'none',
                rag: false,
            })
            .expect(200);

        expect(timeoutLogs).toHaveLength(1);

        const [entry] = timeoutLogs;

        expect(entry.provider).toBe('fake');
        expect(entry.model).toBe('fake-model');
        expect(entry.outcome).toBe('timeout');
        expect(entry.errorCode).toBe('FIRST_TOKEN_TIMEOUT');
    });

});