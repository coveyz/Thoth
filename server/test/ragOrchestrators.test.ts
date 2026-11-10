import { describe, expect, it, vi } from "vitest";

import { createRagIndexManager } from "../src/rag/indexManager";
import { prepareRagTurn } from "../src/orchestrators/ragOrchestrators";
import { AppError } from "../src/lib/error";
import type { RagIndexBuildResult } from "../src/rag/indexBuilder";
import type { RagIndexBuildFunction } from "../src/rag/indexManager";
import type { QueryEmbeddingFunction } from "../src/rag/retriever";
import type { RagRuntime } from "../src/rag/runtime";


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
                        id: 'doc-a-chunk-0',
                        documentId: 'doc-a',
                        title: '示例文档',
                        source: 'a.md',
                        path: 'a.md',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                        chunkIndex: 0,
                        content: '示例正文',
                    },
                    embedding: [1, 0],
                }
            ],
            documentCount: 1,
            chunkCount: 1,
            builtAt: '2026-01-02T00:00:00.000Z'
        },
        diagnostics: []
    }
};

function createContext(build: RagIndexBuildFunction) {
    const indexManager =
        createRagIndexManager({ build });

    const embedQuery =
        vi.fn<QueryEmbeddingFunction>()
            .mockResolvedValue([[1, 0]]);

    const rag: RagRuntime = {
        indexManager,
        embedQuery,
    };

    return { rag, embedQuery, };
};

describe('RAG 编排的请求与共享构建生命周期', () => {
    it('正常请求等待构建完成后才生成问题向量', async () => {
        const deferred = createDeferred<RagIndexBuildResult>();
        const result = createResult();
        const build = vi.fn<RagIndexBuildFunction>(() => deferred.promise);

        const { rag, embedQuery } = createContext(build);

        const controller = new AbortController();
        const pending = prepareRagTurn({
            userMessage: '问题',
            rag,
            signal: controller.signal,
        });
        expect(embedQuery).not.toHaveBeenCalled();
        deferred.resolve(result);

        const prepared = await pending;
        expect(prepared.sources).toHaveLength(1);
        expect(rag.indexManager.getSnapshot()).toBe(result.snapshot);

        expect(embedQuery).toHaveBeenCalledWith(
            ['问题'],
            { signal: controller.signal }
        );

        expect(build).toHaveBeenCalledTimes(1);
    });

    it('开始前已取消的请求不触发构建或问题 Embedding', async () => {
        const build = vi.fn<RagIndexBuildFunction>();
        const { rag, embedQuery } = createContext(build);

        const controller = new AbortController();
        controller.abort();

        await expect(
            prepareRagTurn({
                userMessage: '问题',
                rag,
                signal: controller.signal,
            }),
        ).rejects.toBe(controller.signal.reason);

        expect(build).not.toHaveBeenCalled();
        expect(embedQuery).not.toHaveBeenCalled();

        expect(rag.indexManager.getState().status.state).toBe('pending');
    });

    it('一个请求停止等待，另一个请求继续使用同次构建', async () => {
        const deferred = createDeferred<RagIndexBuildResult>();
        const result = createResult();
        const build = vi.fn<RagIndexBuildFunction>(
            () => deferred.promise,
        );
        const { rag, embedQuery } = createContext(build);
        const firstController = new AbortController();
        const secondController = new AbortController();

        const first = prepareRagTurn({
            userMessage: '第一个问题',
            rag,
            signal: firstController.signal,
        });
        const second = prepareRagTurn({
            userMessage: '第二个问题',
            rag,
            signal: secondController.signal,
        });

        firstController.abort();
        // 构建尚未完成，第一个请求已经退出。
        await expect(first).rejects.toBe(
            firstController.signal.reason,
        );

        expect(build).toHaveBeenCalledTimes(1);
        expect(embedQuery).not.toHaveBeenCalled();
        expect(rag.indexManager.getState().status.state).toBe('indexing');

        deferred.resolve(result);
        const prepared = await second;
        expect(prepared.sources).toHaveLength(1);
        expect(embedQuery).toHaveBeenCalledTimes(1);
        expect(embedQuery).toHaveBeenCalledWith(
            ['第二个问题'],
            { signal: secondController.signal }
        );

        expect(rag.indexManager.getSnapshot())
            .toBe(result.snapshot);

        expect(
            rag.indexManager.getState().lastFailure,
        ).toBeNull();

    });

    it('请求退出后构建失败仍记录状态，后续请求允许重试', async () => {
        const deferred = createDeferred<RagIndexBuildResult>();
        const result = createResult();

        const original = new AppError('EMBEDDING_ERROR');
        const build = vi.fn<RagIndexBuildFunction>()
            .mockImplementationOnce(
                () => deferred.promise,
            )
            .mockResolvedValueOnce(result);

        const { rag, embedQuery } = createContext(build);
        const controller = new AbortController();
        const pending = prepareRagTurn({
            userMessage: '已停止的问题',
            rag,
            signal: controller.signal,
        });

        controller.abort();
        await expect(pending).rejects.toBe(controller.signal.reason);

        /**
       * 取得正在执行的同一个构建任务，
       * 观察它后续独立失败。
       */
        const ongoing = rag.indexManager.rebuild();
        const failureCheck = expect(ongoing).rejects.toBe(original);

        deferred.reject(original);
        await failureCheck;

        expect(rag.indexManager.getSnapshot()).toBeNull();
        expect(rag.indexManager.getState().status.state).toBe('failed');
        expect(embedQuery).not.toHaveBeenCalled();

        const nextController = new AbortController();
        const prepared = await prepareRagTurn({
            userMessage: '重试的问题',
            rag,
            signal: nextController.signal,
        });

        expect(prepared.sources).toHaveLength(1);
        expect(build).toHaveBeenCalledTimes(2);
        expect(embedQuery).toHaveBeenCalledTimes(1);

        expect(rag.indexManager.getState().status.state).toBe('ready');

        expect(rag.indexManager.getState().lastFailure).toBeNull();
    });
});