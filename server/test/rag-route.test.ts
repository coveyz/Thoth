import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRagIndexManager } from "../src/rag/indexManager";
import { createApp } from "../src/app";
import { createTestEnv } from "./helpers/createTestEnv";
import { parseSSE, parseSSEJson } from './helpers/parseSSE';
import { waitForPromise } from '../src/lib/waitForPromise';
import { AppError } from '../src/lib/error';
import type { RagIndexBuildResult } from "../src/rag/indexBuilder";
import type { RagIndexBuildFunction } from "../src/rag/indexManager";
import type { QueryEmbeddingFunction } from "../src/rag/retriever";
import type { RagRuntime } from "../src/rag/runtime";



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
    overallTimeout = 5000
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
            writeLog: () => { },
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