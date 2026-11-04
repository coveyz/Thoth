import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { embedTexts } from '../src/rag/embedding';
import { createRagRuntime, resolveKnowledgeDirectory } from '../src/rag/runtime';
import { createTestEnv } from './helpers/createTestEnv';
import { createTestKnowledge } from './helpers/createTestKnowledge';


/**
 * 只替换外部 Embedding 适配函数。
 */
vi.mock('../src/rag/embedding', () => {
    return {
        embedTexts: vi.fn(
            async (texts: string[]): Promise<number[][]> => {
                return texts.map(() => [1, 0]);
            }
        )
    }
});

const embedMock = vi.mocked(embedTexts);

beforeEach(() => {
    embedMock.mockClear()
});

describe('默认 RAG 运行时', () => {
    it('相对知识库路径以 server 目录为基准', () => {
        expect(
            resolveKnowledgeDirectory('./knowledge')
        ).toBe(
            path.resolve(__dirname, '../knowledge')
        )
    });

    it('绝对知识库路径不受 server 基准目录影响', () => {
        const absoluteDirectory = path.join(tmpdir(), 'thoth-custom-knowledge');

        expect(
            resolveKnowledgeDirectory(absoluteDirectory)
        ).toBe(
            absoluteDirectory
        );
    });


    it('创建 Runtime 不构建索引或调用 Embedding', () => {
        const env = createTestEnv();

        const first = createRagRuntime(env);
        const second = createRagRuntime(env);

        // 检查1：indexManager 状态为 pending（未构建）
        expect(
            first.indexManager.getState()
        ).toEqual({
            currentSnapshot: null,
            status: { state: 'pending' },
            lastFailure: null,
        });

        // 检查2：第二个 runtime 的快照也为 null
        expect(
            second.indexManager.getSnapshot()
        ).toBeNull();

        // 检查3：每次创建都是新的 indexManager
        expect(
            first.indexManager
        ).not.toBe(second.indexManager);

        // 检查4：没有调用 Embedding API
        expect(embedMock).not.toHaveBeenCalled();
    });

    it('按 Env 批次构建，并为 Query 传递请求 signal', async () => {
        const knowledge = await createTestKnowledge();

        try {
            await knowledge.write('a.md', '# 文档 A\n第一篇正文');
            await knowledge.write('b.md', '第二篇正文',);

            const env = createTestEnv({
                THOTH_KNOWLEDGE_DIR: knowledge.root,
                THOTH_EMBEDDING_BATCH_SIZE: 1
            });

            const runtime = createRagRuntime(env);
            const anotherRuntime = createRagRuntime(env);

            expect(embedMock).not.toHaveBeenCalled();

            const snapshot = await runtime.indexManager.ensureReady();

            expect(snapshot.documentCount).toBe(2);
            expect(snapshot.chunkCount).toBe(2);

            expect(snapshot.items.map(item => item.chunk.path)).toEqual(['a.md', 'b.md']);
            expect(embedMock).toHaveBeenCalledTimes(2);

            for (const call of embedMock.mock.calls) {
                expect(call[0]).toHaveLength(1);
                expect(call[1]).toBe(env);
                // 文档构建 没有绑定请求signal
                expect(call[2]).toBeUndefined();
            };

            await runtime.indexManager.ensureReady();
            expect(embedMock).toHaveBeenCalledTimes(2);

            // 同一 Env 创建的另一份 Runtime 也保持独立。
            expect(anotherRuntime.indexManager.getSnapshot()).toBeNull();

            const controller = new AbortController();

            await runtime.embedQuery(['用户问题'], { signal: controller.signal });

            expect(embedMock).toHaveBeenLastCalledWith(
                ['用户问题'],
                env,
                { signal: controller.signal }
            );

            expect(embedMock).toHaveBeenCalledTimes(3);
        } finally {
            await knowledge.cleanup();
        }
    });



})