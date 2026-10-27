import { describe, expect, it, vi } from "vitest";

import { createRagIndexManager } from "../src/rag/indexManager";
import type { RagIndexBuildFunction } from "../src/rag/indexManager";
import type { RagIndexBuildResult } from "../src/rag/indexBuilder";
import { AppError } from "../src/lib/error";


const NOW = '2026-10-23T10:00:00.000Z';
const BUILT_AT = '2026-10-23T10:00:01.000Z';

/**
 * 人工控制 Promise 完成时间，不使用固定演示， 不依赖机器运行速度
 */
function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
};

function createResult(
    label: string,
): RagIndexBuildResult {
    return {
        snapshot: {
            items: [
                {
                    chunk: {
                        id: `${label}-chunk-0`,
                        documentId: label,
                        title: label,
                        source: `${label}.txt`,
                        path: `${label}.txt`,
                        updatedAt: NOW,
                        chunkIndex: 0,
                        content: label,
                    },
                    embedding: [1, 0],
                },
            ],
            documentCount: 1,
            chunkCount: 1,
            builtAt: BUILT_AT,
        },
        diagnostics: [],
    };
};


describe('内存索引管理器', () => {
    it('创建时保持 pending 且不触发构建', () => {
        const build = vi.fn<RagIndexBuildFunction>();

        const manager = createRagIndexManager({
            build,
        });

        expect(manager.getState()).toEqual({
            currentSnapshot: null,
            status: { state: 'pending' },
            lastFailure: null,
        });

        expect(manager.getSnapshot()).toBeNull();
        expect(manager.getDiagnostics()).toEqual([]);
        expect(build).not.toHaveBeenCalled();
    });

    it('首次构建经历 pending、indexing、ready', async () => {
        const deferred = createDeferred<RagIndexBuildResult>();
        const result = createResult('first');

        const build = vi.fn<RagIndexBuildFunction>(
            () => deferred.promise,
        );

        const manager = createRagIndexManager({
            build,
            now: () => new Date(NOW),
        });

        expect(manager.getState().status.state)
            .toBe('pending');

        const pending = manager.ensureReady();

        expect(manager.getState()).toEqual({
            currentSnapshot: null,
            status: {
                state: 'indexing',
                startedAt: NOW,
            },
            lastFailure: null,
        });

        deferred.resolve(result);

        await expect(pending)
            .resolves.toBe(result.snapshot);

        expect(manager.getState()).toEqual({
            currentSnapshot: result.snapshot,
            status: {
                state: 'ready',
                builtAt: BUILT_AT,
                documentCount: 1,
                chunkCount: 1,
            },
            lastFailure: null,
        });
    });

    it('并发首次构建复用同一个 Promise 和构建结果', async () => {
        const deferred = createDeferred<RagIndexBuildResult>();
        const result = createResult('shared');

        const build = vi.fn<RagIndexBuildFunction>(
            () => deferred.promise,
        );

        const manager = createRagIndexManager({ build });

        const first = manager.ensureReady();
        const second = manager.ensureReady();
        const third = manager.rebuild();

        expect(second).toBe(first);
        expect(third).toBe(first);

        // 让 Promise.then 中的 build 开始执行。
        await Promise.resolve();

        expect(build).toHaveBeenCalledTimes(1);

        deferred.resolve(result);

        const snapshots = await Promise.all([
            first,
            second,
            third,
        ]);

        expect(
            snapshots.every((snapshot) => snapshot === result.snapshot)
        ).toBe(true);
    });

    it('构建成功后 ensureReady 复用快照而不重复构建', async () => {
        const result = createResult('cached');

        const build = vi.fn<RagIndexBuildFunction>()
            .mockResolvedValue(result);

        const manager = createRagIndexManager({
            build,
        });

        await manager.ensureReady();

        await expect(manager.ensureReady())
            .resolves.toBe(result.snapshot);

        expect(build).toHaveBeenCalledTimes(1);
    });

    it('合法空快照也视为已就绪，不反复构建', async () => {
        const result: RagIndexBuildResult = {
            snapshot: {
                items: [],
                documentCount: 0,
                chunkCount: 0,
                builtAt: BUILT_AT,
            },
            diagnostics: [],
        };

        const build = vi.fn<RagIndexBuildFunction>()
            .mockResolvedValue(result);

        const manager = createRagIndexManager({
            build,
        });

        await manager.ensureReady();
        await manager.ensureReady();

        expect(manager.getSnapshot())
            .toBe(result.snapshot);

        expect(build).toHaveBeenCalledTimes(1);
        expect(manager.getState().status.state)
            .toBe('ready');
    });

    it('首次失败记录安全摘要且没有可用快照', async () => {
        const original = new AppError(
            'EMBEDDING_ERROR',
            {
                cause: new Error(
                    '/private/secret-path private key',
                ),
            },
        );

        const build = vi.fn<RagIndexBuildFunction>()
            .mockRejectedValue(original);

        const manager = createRagIndexManager({
            build,
            now: () => new Date(NOW),
        });

        await expect(manager.ensureReady())
            .rejects.toBe(original);

        const failure = {
            failedAt: NOW,
            code: 'EMBEDDING_ERROR',
            message: '知识库检索暂时不可用，请稍后重试',
        };

        expect(manager.getState()).toEqual({
            currentSnapshot: null,
            status: {
                state: 'failed',
                failure,
            },
            lastFailure: failure,
        });

        expect(JSON.stringify(manager.getState()))
            .not.toContain('/private/secret-path');

        expect(JSON.stringify(manager.getState()))
            .not.toContain('private key');
    });

    it('首次失败后 ensureReady 可以重新构建并清除失败摘要', async () => {
        const original = new AppError('DOCUMENT_LOAD_ERROR');

        const result = createResult('retry');

        const build = vi.fn<RagIndexBuildFunction>()
            .mockRejectedValueOnce(original)
            .mockResolvedValueOnce(result);

        const manager = createRagIndexManager({
            build,
        });

        await expect(manager.ensureReady()).rejects.toBe(original);

        await expect(manager.ensureReady()).resolves.toBe(result.snapshot);

        expect(build).toHaveBeenCalledTimes(2);

        expect(manager.getState().status.state).toBe('ready');

        expect(manager.getState().lastFailure).toBeNull();
    });

    it('重建期间复用旧快照，完成后原子替换且并发重建复用任务', async () => {
        const first = createResult('old');
        const second = createResult('new');

        const deferred = createDeferred<RagIndexBuildResult>();

        const build = vi.fn<RagIndexBuildFunction>()
            .mockResolvedValueOnce(first)
            .mockImplementationOnce(
                () => deferred.promise,
            );

        const manager = createRagIndexManager({
            build,
        });

        await manager.ensureReady();

        const capturedOldSnapshot =
            manager.getSnapshot();

        const rebuilding = manager.rebuild();

        expect(manager.rebuild()).toBe(rebuilding);

        expect(manager.getState().status.state)
            .toBe('indexing');

        expect(manager.getSnapshot())
            .toBe(first.snapshot);

        // 有旧快照的查询不等待本次重建。
        await expect(manager.ensureReady())
            .resolves.toBe(first.snapshot);

        expect(build).toHaveBeenCalledTimes(2);

        deferred.resolve(second);

        await expect(rebuilding)
            .resolves.toBe(second.snapshot);

        expect(manager.getSnapshot())
            .toBe(second.snapshot);

        // 已经取得旧引用的查询，仍持有原来完整的快照。
        expect(capturedOldSnapshot)
            .toBe(first.snapshot);

        expect(
            capturedOldSnapshot?.items[0].chunk.content,
        ).toBe('old');
    });


    it('重建失败保留旧快照，ensureReady 不自动反复重建', async () => {
        const first = createResult('old');

        const original =
            new AppError('EMBEDDING_ERROR');

        const build = vi.fn<RagIndexBuildFunction>()
            .mockResolvedValueOnce(first)
            .mockRejectedValueOnce(original);


        const manager = createRagIndexManager({
            build,
        });

        await manager.ensureReady();

        await expect(manager.rebuild())
            .rejects.toBe(original);

        expect(manager.getSnapshot())
            .toBe(first.snapshot);

        expect(manager.getState().status.state)
            .toBe('failed');

        await expect(manager.ensureReady())
            .resolves.toBe(first.snapshot);

        expect(build).toHaveBeenCalledTimes(2);

        // 查询成功复用旧快照，不掩盖最近的构建失败。
        expect(manager.getState().status.state)
            .toBe('failed');
    });

    it('同步抛出的构建异常也进入 failed，之后允许重试', async () => {
        const original = new Error(
            'private synchronous failure',
        );

        const result = createResult('retry');

        const build = vi.fn<RagIndexBuildFunction>()
            .mockImplementationOnce(() => {
                throw original;
            })
            .mockResolvedValueOnce(result);

        const manager = createRagIndexManager({
            build,
        });

        await expect(manager.rebuild())
            .rejects.toMatchObject({
                code: 'RAG_INDEX_ERROR',
                cause: original,
            });

        expect(manager.getState().status.state)
            .toBe('failed');

        expect(JSON.stringify(manager.getState()))
            .not.toContain('private synchronous failure');

        await expect(manager.rebuild())
            .resolves.toBe(result.snapshot);

        expect(build).toHaveBeenCalledTimes(2);
    });

    it('诊断返回副本，重建失败保留旧诊断，重试成功后更新', async () => {
        const first = createResult('first');
        first.diagnostics = [
            {
                code: 'EMPTY_DOCUMENT',
                path: 'first-empty.md',
                message: '文档为空，已跳过',
            },
        ];

        const second = createResult('second');
        second.diagnostics = [
            {
                code: 'EMPTY_DOCUMENT',
                path: 'second-empty.md',
                message: '文档为空，已跳过',
            },
        ];

        const original = new AppError('DOCUMENT_LOAD_ERROR');

        const build = vi.fn<RagIndexBuildFunction>()
            .mockResolvedValueOnce(first)
            .mockRejectedValueOnce(original)
            .mockResolvedValueOnce(second);

        const manager = createRagIndexManager({
            build,
        });

        await manager.ensureReady();

        const view = manager.getDiagnostics();

        view[0].path = 'outside-change.md';
        view.push({
            code: 'EMPTY_DOCUMENT',
            path: 'extra.md',
            message: '外部添加',
        });

        expect(manager.getDiagnostics()).toEqual(first.diagnostics);

        await expect(manager.rebuild()).rejects.toBe(original);

        expect(manager.getDiagnostics()).toEqual(first.diagnostics);

        // 有旧快照时，通过显式 rebuild 重试。
        await manager.rebuild();

        expect(manager.getSnapshot()).toBe(second.snapshot);

        expect(manager.getDiagnostics()).toEqual(second.diagnostics);

        expect(manager.getState().lastFailure).toBeNull();
    });

    it('修改读取到的失败摘要不会改变 Manager 内部状态', async () => {
        const original = new AppError('RAG_INDEX_ERROR');

        const build = vi.fn<RagIndexBuildFunction>()
            .mockRejectedValue(original);

        const manager = createRagIndexManager({
            build,
        });

        await expect(manager.rebuild())
            .rejects.toBe(original);

        const view = manager.getState();

        if (view.lastFailure !== null) {
            view.lastFailure.message = '外部修改';
        }

        if (view.status.state === 'failed') {
            view.status.failure.message = '另一处修改';
        }

        expect(manager.getState().lastFailure?.message)
            .toBe('知识库索引构建失败，请稍后重试');

        const latest = manager.getState();

        expect(latest.status).toMatchObject({
            state: 'failed',
            failure: {
                message: '知识库索引构建失败，请稍后重试',
            },
        });
    });

    it('不同 Manager 实例不共享任务和快照', async () => {
        const first = createResult('first');
        const second = createResult('second');

        const firstBuild = vi.fn<RagIndexBuildFunction>()
                .mockResolvedValue(first);

        const secondBuild = vi.fn<RagIndexBuildFunction>()
                .mockResolvedValue(second);

        const firstManager = createRagIndexManager({
                build: firstBuild,
            });

        const secondManager = createRagIndexManager({
                build: secondBuild,
            });

        await firstManager.ensureReady();

        expect(secondManager.getSnapshot())
            .toBeNull();

        expect(secondManager.getState().status.state)
            .toBe('pending');

        expect(secondBuild).not.toHaveBeenCalled();

        await secondManager.ensureReady();

        expect(firstManager.getSnapshot())
            .toBe(first.snapshot);

        expect(secondManager.getSnapshot())
            .toBe(second.snapshot);
    });
});