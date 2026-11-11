import { once } from 'node:events';
import { createServer } from 'node:http';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

import { createRagIndexManager } from "../src/rag/indexManager";
import { createApp } from "../src/app";
import { createTestEnv } from "./helpers/createTestEnv";
import { parseSSE, parseSSEJson } from './helpers/parseSSE';
import { waitForPromise } from '../src/lib/waitForPromise';
import { AppError } from '../src/lib/error';
import * as sse from '../src/lib/sse';
import type { RagIndexBuildResult } from "../src/rag/indexBuilder";
import type { RagIndexBuildFunction } from "../src/rag/indexManager";
import type { QueryEmbeddingFunction } from "../src/rag/retriever";
import type { RagRuntime } from "../src/rag/runtime";
import type { LogWriter, RequestLogEntry } from '../src/lib/logger';


/**
 * 只记录最终回答流是否启动。
 * vi.hoisted 保证 mock 工厂执行时 controls 已经存在。
 */
const controls = vi.hoisted(() => ({
    stream: vi.fn(),
}));


/**
 * 不访问真实模型，也不引入 Fake Provider 的逐段延迟。
 * 本文件关注 RAG 请求生命周期和 SSE 错误边界。
 */
vi.mock('../src/providers/index.ts', () => ({
    getProvider: () => ({
        name: 'rag-route-test',
        model: 'rag-route-test-model',
        async generate() {
            throw new Error('本组 RAG 测试不应调用 generate');
        },
        async *stream() {
            controls.stream();
            yield '测试回答';
        }
    })
}));

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
};

function createResult(): RagIndexBuildResult {
    return {
        snapshot: {
            items: [
                {
                    chunk: {
                        id: 'guide-chunk-0',
                        documentId: 'guide',
                        title: '测试文档',
                        source: 'guide.md',
                        path: 'guide.md',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                        chunkIndex: 0,
                        content: '测试文档正文',
                    },
                    embedding: [1, 0],
                },
            ],
            documentCount: 1,
            chunkCount: 1,
            builtAt: '2026-01-02T00:00:00.000Z',
        },
        diagnostics: [],
    };
}

function createFixture(
    build: RagIndexBuildFunction,
    embedQuery: QueryEmbeddingFunction,
    overallTimeout = 5000,
    writeLog?: LogWriter,
) {
    const indexManager = createRagIndexManager({ build });

    const rag: RagRuntime = {
        indexManager,
        embedQuery
    };

    const app = createApp(
        createTestEnv({
            THOTH_OVERALL_TIMEOUT_MS: overallTimeout,
            THOTH_FIRST_TOKEN_TIMEOUT_MS: 1000,
            THOTH_PING_INTERVAL_MS: 1000,
        }),
        {
            rag,
            writeLog: writeLog ?? (() => { }),
        },
    );

    return { app, indexManager };
};


function sendChat(app: ReturnType<typeof createApp>) {
    return request(app)
        .post('/api/chat/stream')
        .set('Accept', 'text/event-stream')
        .send({
            message: '测试问题',
            toolChoice: 'none',
            rag: true,
        })
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);
};

/**
 * 验证错误事件的协议与 requestId
 * 此时不应再有 sources、delta 或 done
 */
function expectSafeError(
    text: string,
    code: string,
    message: string
) {
    const events = parseSSE(text);
    expect(events.map(event => event.name)).toEqual(['start', 'error']);

    const start = parseSSEJson<{
        requestId: string
    }>(events[0]);
    const error = parseSSEJson<{
        code: string;
        message: string;
        requestId: string;
    }>(events[1]);

    expect(start.requestId).toBeTruthy();
    expect(error).toEqual({
        code,
        message,
        requestId: start.requestId,
    });
};

beforeEach(() => {
    vi.resetAllMocks();
    controls.stream.mockClear();
});

describe('RAG 接口的超时与安全错误', () => {

    it.each([
        { name: '共享构建', phase: 'build' },
        { name: '问题 Embedding', phase: 'query' },
    ] as const)(
        '$name 期间整体超时会退出请求，后续请求仍可复用索引',
        async ({ phase }) => {
            const result = createResult();
            const building = createDeferred<RagIndexBuildResult>();
            const querying = createDeferred<number[][]>();

            const build = vi.fn<RagIndexBuildFunction>(() => {
                return phase === 'build'
                    ? building.promise // ← 场景 A：构建延迟（会超时）
                    : Promise.resolve(result); // ← 场景 B：构建立即完成
            });

            let querySignal: AbortSignal | undefined;

            const embedQuery = vi.fn<QueryEmbeddingFunction>()
                .mockResolvedValue([[1, 0]]);

            if (phase === 'query') {
                embedQuery.mockImplementationOnce(
                    (_texts, options) => {
                        querySignal = options?.signal;

                        // 模拟会响应请求取消的 Query Provider。
                        return waitForPromise(
                            querying.promise, // ← 查询延迟（会超时）
                            options?.signal, // ← 支持取消
                        );
                    },
                );
            }

            const fixture = createFixture(
                build,
                embedQuery,
                500,
            );

            try {
                // 对应阶段始终不完成，只允许整体超时结束请求。
                const response = await sendChat(fixture.app);

                expectSafeError(
                    response.text,
                    'OVERALL_TIMEOUT',
                    '请求处理超时，请稍后重试',
                );
                // 验证请求流未启动
                expect(controls.stream).not.toHaveBeenCalled();
                expect(build).toHaveBeenCalledTimes(1);

                if (phase === 'build') {
                    // 建还没完成，embedQuery 未被调用
                    expect(embedQuery).not.toHaveBeenCalled();
                    // 未完成
                    expect(fixture.indexManager.getState().status.state).toBe('indexing');
                    // 没有快照 构建未完成
                    expect(fixture.indexManager.getSnapshot()).toBeNull();
                } else {
                    expect(embedQuery).toHaveBeenCalledTimes(1);
                    expect(querySignal).toBeInstanceOf(AbortSignal);
                    expect(querySignal?.aborted).toBe(true);

                    expect(fixture.indexManager.getSnapshot()).toBe(result.snapshot);
                };

                // 请求已经结束，再允许后台任务完成。
                building.resolve(result);
                querying.resolve([[1, 0]]);

                await fixture.indexManager.ensureReady();

                // 原请求不应因后台任务完成而启动最终回答流。
                expect(controls.stream).not.toHaveBeenCalled();

                const next = await sendChat(fixture.app);
                const names = parseSSE(next.text).map(event => event.name);

                expect(names).toEqual([
                    'start',
                    'sources',
                    'delta',
                    'done',
                ]);

                // 后续请求复用快照，没有重新构建。
                expect(build).toHaveBeenCalledTimes(1);
                expect(controls.stream).toHaveBeenCalledTimes(1);

                // 场景 A：第二个请求调用 → 1 次
                // 场景 B：第一个和第二个都调用 → 2 次
                expect(embedQuery).toHaveBeenCalledTimes(
                    phase === 'build' ? 1 : 2,
                );

                expect(fixture.indexManager.getSnapshot()).toBe(result.snapshot);
            } finally {
                // 即使断言失败，也结束测试自己创建的任务。
                building.resolve(result);
                querying.resolve([[1, 0]]);
            }
        },
    );

    it.each([
        {
            code: 'DOCUMENT_LOAD_ERROR',
            message: '知识库文档加载失败，请检查文档配置后重试',
        },
        {
            code: 'RAG_INDEX_ERROR',
            message: '知识库索引构建失败，请稍后重试',
        },
    ] as const)(
        '$code 只公开安全错误字段',
        async ({ code, message }) => {
            const privatePath = '/private/thoth-test-knowledge/secret.md';
            const privateToken = 'test-secret-token';

            const original = new Error(
                `读取 ${privatePath} 失败：${privateToken}`,
            );

            const build = vi.fn<RagIndexBuildFunction>()
                .mockRejectedValue(
                    new AppError(code, { cause: original }),
                );

            const embedQuery = vi.fn<QueryEmbeddingFunction>();
            const fixture = createFixture(build, embedQuery);

            const response = await sendChat(fixture.app);

            expectSafeError(response.text, code, message);

            expect(response.text).not.toContain(privatePath);
            expect(response.text).not.toContain(privateToken);
            expect(response.text).not.toContain('cause');
            expect(response.text).not.toContain('stack');

            expect(embedQuery).not.toHaveBeenCalled();
            expect(controls.stream).not.toHaveBeenCalled();

            expect(
                fixture.indexManager.getState().status.state,
            ).toBe('failed');

            expect(
                fixture.indexManager.getSnapshot(),
            ).toBeNull();
        },
    );
});

/**
 * 启动仅监听本机的临时测试服务
 * 端口 0 表示交给系统分配空闲端口
 */
async function startTestServer(
    app: ReturnType<typeof createApp>
) {
    const server = createServer(app);
    //  先订约 避免遗漏 listening 事件
    const listening = once(server, 'listening');

    server.listen(0, '127.0.0.1');
    await listening;

    const address = server.address();

    if (address === null || typeof address === 'string') {
        await closeTestServer(server);
        throw new Error('未取得测试服务端口');
    };

    return {
        server,
        url: `http://127.0.0.1:${address.port}`
    }
};

/**
 * 结束监听并关闭残留连接
 * finally 中调用 避免测试失败后端口或链接 继续存活
 */
async function closeTestServer(server: Server) {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            };
            resolve()
        });

        server.closeAllConnections();
    });
};

/**
 * fetch 收到响应头，不代表客户端已经收到 start 事件
 * 持续读取，直到收到完整的第一个 SSE 事件
 */
async function readStartEvent(response: Response) {
    if (response.body === null) {
        throw new Error('SSE 响应缺少 body');
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                throw new Error('连接在 start 事件之前结束');
            }

            text += decoder.decode(value, { stream: true });

            const events = parseSSE(text);

            if (text.includes('\n\n') && events.length > 0) {
                expect(events[0].name).toBe('start');
                return;
            }
        }
    } finally {
        reader.releaseLock();
    }
};

describe('RAG 客户端断开连接', () => {
    it.each([
        { name: '等待共享构建', phase: 'build' },
        { name: '生成问题向量', phase: 'query' },
    ] as const)(
        '$name 时断开连接会退出当前请求，并保留共享索引',
        async ({ phase }) => {
            const result = createResult();

            const building = createDeferred<RagIndexBuildResult>();
            const querying = createDeferred<number[][]>();

            // 确认请求已经进入我们要测试的阶段。
            const stageStarted = createDeferred<void>();
            // 服务端日志用于观察服务端收到连接关闭事件。
            const completed = createDeferred<RequestLogEntry>();

            const build = vi.fn<RagIndexBuildFunction>(() => {
                // phase === 'build' 让构建一直卡着
                if (phase === 'build') {
                    stageStarted.resolve(undefined);
                    return building.promise;
                }

                return Promise.resolve(result);
            });

            let querySignal: AbortSignal | undefined;

            const embedQuery = vi.fn<QueryEmbeddingFunction>()
                .mockResolvedValue([[1, 0]]);

            if (phase === 'query') {
                embedQuery.mockImplementationOnce(
                    (_texts, options) => {
                        querySignal = options?.signal;
                        stageStarted.resolve(undefined);

                        return waitForPromise(
                            querying.promise,
                            options?.signal,
                        );
                    },
                );
            }

            const fixture = createFixture(
                build,
                embedQuery,
                5000,
                entry => completed.resolve(entry),
            );

            // 保留真实写入行为，只记录调用。
            const writeEvent = vi.spyOn(sse, 'safeWriteEvent');

            const { server, url } = await startTestServer(fixture.app);
            const clientController = new AbortController();

            try {
                const response = await fetch(
                    `${url}/api/chat/stream`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'text/event-stream',
                        },
                        body: JSON.stringify({
                            message: '准备停止的问题',
                            toolChoice: 'none',
                            rag: true,
                        }),
                        signal: clientController.signal,
                    },
                );

                expect(response.status).toBe(200);

                await readStartEvent(response);
                await stageStarted.promise;

                // 模拟客户端停止请求，而不是等待服务端超时。
                clientController.abort();

                const entry = await completed.promise;

                expect(entry.outcome).toBe('client_closed');
                expect(entry.errorCode).toBeUndefined();

                if (phase === 'build') {
                    expect(fixture.indexManager.getState().status.state).toBe('indexing');
                    expect(fixture.indexManager.getSnapshot()).toBeNull();
                    expect(embedQuery).not.toHaveBeenCalled();
                } else {
                    expect(querySignal).toBeInstanceOf(AbortSignal);
                    expect(querySignal?.aborted).toBe(true);

                    expect(fixture.indexManager.getSnapshot()).toBe(result.snapshot);
                }

                // 客户端已退出，原始任务随后完成。
                building.resolve(result);
                querying.resolve([[1, 0]]);

                await fixture.indexManager.ensureReady();

                // 让取消和完成产生的 Promise 回调执行完毕。
                await new Promise<void>(resolve => {
                    setImmediate(resolve);
                });

                expect(controls.stream).not.toHaveBeenCalled();

                // 检查服务端没有尝试继续发送业务结果。
                const eventNames = writeEvent.mock.calls.map(call => call[1]);

                expect(eventNames).toContain('start');
                expect(eventNames).not.toContain('sources');
                expect(eventNames).not.toContain('delta');
                expect(eventNames).not.toContain('done');
                expect(eventNames).not.toContain('error');

                // 新请求仍能使用已完成的共享索引。
                const next = await sendChat(fixture.app);

                expect(
                    parseSSE(next.text).map(event => event.name)
                ).toEqual([
                    'start',
                    'sources',
                    'delta',
                    'done',
                ]);

                expect(build).toHaveBeenCalledTimes(1);
                expect(controls.stream).toHaveBeenCalledTimes(1);

                expect(embedQuery).toHaveBeenCalledTimes(
                    phase === 'build' ? 1 : 2,
                );
            } finally {
                clientController.abort();
                building.resolve(result);
                querying.resolve([[1, 0]]);

                await closeTestServer(server);
                writeEvent.mockRestore();
            }
        },
    );
});