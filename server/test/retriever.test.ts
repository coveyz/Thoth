import { unlink, utimes } from "fs/promises";
import { describe, expect, it, vi } from "vitest";

import { retrieveSourcesFromSnapshot } from "../src/rag/retriever";
import { toPublicError } from "../src/lib/error";
import { createRagIndexManager } from "../src/rag/indexManager";
import { createTestKnowledge } from "./helpers/createTestKnowledge";
import { buildRagIndex } from "../src/rag/indexBuilder";
import type { RagIndexItem, RagIndexSnapshot } from "../src/rag/types";
import type { QueryEmbeddingFunction, RetrieveSnapshotSourcesInput } from "../src/rag/retriever";
import type { EmbeddingFunction } from "../src/rag/embeddingBatch";


const UPDATED_AT = '2026-01-01T00:00:00.000Z';

function createItem(label: string, embedding: number[]): RagIndexItem {
    return {
        chunk: {
            id: `doc-${label}-chunk-0`,
            documentId: `doc-${label}`,
            title: `标题 ${label}`,
            source: `${label}.md`,
            path: `${label}.md`,
            updatedAt: UPDATED_AT,
            chunkIndex: 0,
            content: `正文 ${label}`,
        },
        embedding
    }
};

function createSnapshot(
    items: RagIndexItem[]
): RagIndexSnapshot {
    return {
        items,
        documentCount: new Set(items.map((item) => item.chunk.documentId)).size,
        chunkCount: items.length,
        builtAt: UPDATED_AT
    }
};

function createDefaultSnapshot(): RagIndexSnapshot {
    return createSnapshot([
        createItem('a', [1, 0, 0]),
        createItem('b', [0.8, 0.6, 0]),
        createItem('c', [0, 1, 0]),
    ]);
};



describe('Snapshot 向量检索', () => {
    it('只生成问题向量并返回完整、安全且按分数排序的 Sources', async () => {
        const snapshot = createDefaultSnapshot();
        const original = structuredClone(snapshot);

        const embedQuery = vi.fn<QueryEmbeddingFunction>()
            .mockResolvedValue([[1, 0, 0]]);

        const result = await retrieveSourcesFromSnapshot(
            {
                query: '我的问题',
                snapshot: snapshot
            },
            embedQuery
        );

        expect(embedQuery).toHaveBeenCalledTimes(1);
        expect(embedQuery).toHaveBeenCalledWith(['我的问题'], { signal: undefined });

        expect(result.sources.map(source => source.path)).toEqual(['a.md', 'b.md']);
        expect(result.sources[0]).toEqual({
            ...snapshot.items[0].chunk,
            score: 1
        });
        expect(result.sources[1].score).toBeCloseTo(0.8);

        for (const source of result.sources) {
            expect(source).not.toHaveProperty('embedding');
        };

        expect(snapshot).toEqual(original);
    });

    it('无相关内容时返回空 Sources', async () => {
        const embedQuery = vi.fn<QueryEmbeddingFunction>().mockResolvedValue([[0, 0, 1]]);
        await expect(
            retrieveSourcesFromSnapshot(
                {
                    query: '无关问题',
                    snapshot: createDefaultSnapshot()
                },
                embedQuery
            )
        ).resolves.toEqual({ sources: [] });
    });

    it('按 TopK 限制返回数量', async () => {
        const embedQuery = vi.fn<QueryEmbeddingFunction>().mockResolvedValue([[1, 0, 0]]);

        const result = await retrieveSourcesFromSnapshot(
            {
                query: '问题',
                snapshot: createDefaultSnapshot(),
                options: {
                    topK: 1
                }
            },
            embedQuery
        );

        expect(result.sources.map(source => source.path)).toEqual(['a.md']);
    });

    it('保留分数等于阈值的结果', async () => {
        const embedQuery = vi.fn<QueryEmbeddingFunction>().mockResolvedValue([[1, 0, 0]]);

        const result = await retrieveSourcesFromSnapshot(
            {
                query: '问题',
                snapshot: createDefaultSnapshot(),
                options: { minScore: 1 },
            },
            embedQuery,
        );
        expect(result.sources.map(source => source.path)).toEqual(['a.md']);
    });

    it('空快照返回 no-hit 且不调用问题 Embedding', async () => {
        const embedQuery = vi.fn<QueryEmbeddingFunction>();

        await expect(
            retrieveSourcesFromSnapshot(
                {
                    query: '问题',
                    snapshot: createSnapshot([])
                },
                embedQuery
            )
        ).resolves.toEqual({ sources: [] });

        expect(embedQuery).not.toHaveBeenCalled();
    });

    it('同分结果保留快照原有顺序', async () => {
        const snapshot = createSnapshot([
            createItem('b', [1, 0, 0]),
            createItem('a', [1, 0, 0])
        ]);

        const embedQuery = vi.fn<QueryEmbeddingFunction>().mockResolvedValue([[1, 0, 0]]);

        const result = await retrieveSourcesFromSnapshot(
            {
                query: '问题',
                snapshot: snapshot
            },
            embedQuery
        );

        expect(result.sources.map(source => source.path)).toEqual(['b.md', 'a.md']);
    });

    it.each([
        { name: 'TopK 为零', options: { topK: 0 } },
        { name: 'TopK 为负数', options: { topK: -1 } },
        { name: 'TopK 为小数', options: { topK: 1.5 } },
        {
            name: 'TopK 为 NaN',
            options: { topK: Number.NaN },
        },
        {
            name: '阈值小于 -1',
            options: { minScore: -2 },
        },
        {
            name: '阈值大于 1',
            options: { minScore: 2 },
        },
        {
            name: '阈值为 NaN',
            options: { minScore: Number.NaN },
        },
    ])('拒绝非法检索配置：$name', async ({ options }) => {
        const embedQuery = vi.fn<QueryEmbeddingFunction>();

        await expect(
            retrieveSourcesFromSnapshot(
                {
                    query: '问题',
                    snapshot: createDefaultSnapshot(),
                    options,
                },
                embedQuery
            )
        ).rejects.toMatchObject({
            code: 'RAG_INDEX_ERROR'
        });

        expect(embedQuery).not.toHaveBeenCalled();
    });

    it.each([
        { name: '没有向量', vectors: [] },
        {
            name: '返回多个问题向量',
            vectors: [[1, 0, 0], [0, 1, 0]],
        },
        { name: '空向量', vectors: [[]] },
        {
            name: '包含 NaN',
            vectors: [[Number.NaN, 0, 0]],
        },
        {
            name: '包含无穷大',
            vectors: [[Number.POSITIVE_INFINITY, 0, 0]],
        },
    ])('拒绝非法问题向量：$name', async ({ vectors }) => {
        const embedQuery = vi.fn<QueryEmbeddingFunction>().mockResolvedValue(vectors);

        await expect(
            retrieveSourcesFromSnapshot(
                {
                    query: '问题',
                    snapshot: createDefaultSnapshot(),
                },
                embedQuery
            )
        ).rejects.toMatchObject({
            code: 'EMBEDDING_ERROR'
        });
    });

    it('问题向量与索引维度不一致时明确失败', async () => {
        const embedQuery = vi.fn<QueryEmbeddingFunction>().mockResolvedValue([[1, 0]]);

        await expect(
            retrieveSourcesFromSnapshot(
                {
                    query: '问题',
                    snapshot: createDefaultSnapshot(),
                },
                embedQuery,
            ),
        ).rejects.toMatchObject({
            code: 'RAG_INDEX_ERROR'
        });
    });

    it('问题 Embedding 失败时返回安全错误并保留 cause', async () => {
        const original = new Error('private query provider detail');

        const embedQuery = vi.fn<QueryEmbeddingFunction>().mockRejectedValue(original);

        const pending = retrieveSourcesFromSnapshot(
            {
                query: '问题',
                snapshot: createDefaultSnapshot(),
            },
            embedQuery,
        );

        await expect(pending).rejects.toMatchObject({
            code: 'EMBEDDING_ERROR',
            cause: original
        });

        const publicError = await pending.catch((error: unknown) => {
            return toPublicError(error);
        })

        expect(publicError).toEqual({
            code: 'EMBEDDING_ERROR',
            message: '知识库检索暂时不可用，请稍后重试',
        });

        expect(JSON.stringify(publicError)).not.toContain('private query provider detail');
    });

    it('将同一个请求 signal 传给问题 Embedding', async () => {
        const controller = new AbortController();
        const embedQuery = vi.fn<QueryEmbeddingFunction>().mockResolvedValue([[1, 0, 0]]);

        await retrieveSourcesFromSnapshot(
            {
                query: '问题',
                snapshot: createDefaultSnapshot(),
                signal: controller.signal
            },
            embedQuery
        );

        expect(embedQuery).toHaveBeenCalledWith(
            ['问题'],
            { signal: controller.signal }
        )
    });

    it('开始前已取消时不调用问题 Embedding', async () => {
        const controller = new AbortController();
        controller.abort();
        const embedQuery = vi.fn<QueryEmbeddingFunction>();

        await expect(
            retrieveSourcesFromSnapshot(
                {
                    query: '问题',
                    snapshot: createDefaultSnapshot(),
                    signal: controller.signal,
                },
                embedQuery,
            ),
        ).rejects.toBe(controller.signal.reason);

        expect(embedQuery).not.toHaveBeenCalled();
    });

    it('上游忽略取消并返回结果后也不继续评分', async () => {
        const controller = new AbortController();
        let finish!: (vectors: number[][]) => void;

        const embedQuery = vi.fn<QueryEmbeddingFunction>(
            () => new Promise<number[][]>(resolve => {
                finish = resolve;
            })
        );

        const pending = retrieveSourcesFromSnapshot(
            {
                query: '问题',
                snapshot: createDefaultSnapshot(),
                signal: controller.signal,
            },
            embedQuery
        );

        controller.abort();
        finish([[1, 0, 0]]);

        await expect(pending).rejects.toBe(controller.signal.reason);
    });

    it('异步等待期间始终使用开始时取得的快照', async () => {
        const oldSnapshot = createSnapshot([
            createItem('old', [1, 0, 0]),
        ]);
        const newSnapshot = createSnapshot([
            createItem('new', [1, 0, 0]),
        ]);

        const input: RetrieveSnapshotSourcesInput = {
            query: '问题',
            snapshot: oldSnapshot,
        };
        let finish!: (vectors: number[][]) => void;
        const embedQuery = vi.fn<QueryEmbeddingFunction>(
            () => new Promise<number[][]>(resolve => {
                finish = resolve;
            })
        );

        const pending = retrieveSourcesFromSnapshot(
            input,
            embedQuery
        );

        input.snapshot = newSnapshot;
        finish([[1, 0, 0]]);

        const result = await pending;

        expect(
            result.sources.map((source) => source.path),
        ).toEqual(['old.md']);
    });

    it('真实文件新增、修改、删除后检索返回最新 Sources', async () => {
        const knowledge = await createTestKnowledge()

        const vectorFor = (text: string) => [
            text.includes('苹果') ? 1 : 0,
            text.includes('香蕉') ? 1 : 0
        ];

        const embedDocuments = vi.fn<EmbeddingFunction>(
            async (texts) => texts.map(vectorFor)
        );

        const embedQuery = vi.fn<QueryEmbeddingFunction>(
            async (texts) => texts.map(vectorFor),
        );


        const manager = createRagIndexManager({
            build: () => {
                return buildRagIndex(
                    {
                        knowledgeDir: knowledge.root,
                        config: {
                            chunkSize: 200,
                            overlap: 20,
                            embeddingBatchSize: 2
                        }
                    },
                    {
                        embed: embedDocuments
                    }
                )
            }
        });

        async function search(query: string) {
            const snapshot = await manager.ensureReady();

            return retrieveSourcesFromSnapshot(
                {
                    query,
                    snapshot
                },
                embedQuery
            );
        };

        try {
            const baseFile = await knowledge.write(
                'base.txt',
                '香蕉基础说明',
            );

            expect(baseFile).toBeTruthy();
            await expect(search('苹果')).resolves.toEqual({ sources: [] });

            const guideFile = await knowledge.write(
                'guide.md',
                '# 旧苹果指南\n苹果旧内容',
            );
            const oldTime = new Date('2026-01-01T00:00:00.000Z');
            await utimes(guideFile, oldTime, oldTime);

            await manager.rebuild();

            const buildCalls = embedDocuments.mock.calls.length;
            const added = await search('苹果');

            expect(added.sources).toHaveLength(1);
            expect(added.sources[0]).toMatchObject({
                title: '旧苹果指南',
                source: 'guide.md',
                path: 'guide.md',
                updatedAt: oldTime.toISOString(),
                content: '# 旧苹果指南\n苹果旧内容',
                score: 1,
            });
            expect(embedDocuments).toHaveBeenCalledTimes(buildCalls);

            // 保存旧文档 ID
            const documentId = added.sources[0].documentId;
            await knowledge.write(
                'guide.md',
                '# 新香蕉指南\n香蕉新内容',
            );
            const newTime = new Date('2026-01-02T00:00:00.000Z');
            await utimes(guideFile, newTime, newTime);

            await manager.rebuild();
            // 搜索苹果应该返回空
            await expect(search('苹果')).resolves.toEqual({ sources: [] });
            // 搜索香蕉应该返回修改后的内容
            const changed = await search('香蕉');
            const guideSource = changed.sources.find((source) => source.path === 'guide.md');

            expect(guideSource).toMatchObject({
                documentId, // 🔑 同一个文档（documentId不变）
                title: '新香蕉指南',
                source: 'guide.md',
                path: 'guide.md',
                updatedAt: newTime.toISOString(),
                content: '# 新香蕉指南\n香蕉新内容',
                score: 1,
            });

            await unlink(guideFile);
            await manager.rebuild();

            const deleted = await search('香蕉');
            // 只剩 base.txt
            expect(
                deleted.sources.map((source) => source.path)
            ).toEqual(['base.txt']);
            // 旧文档ID不存在
            expect(
                deleted.sources.some((source) => source.documentId === documentId)
            ).toBe(false);

            // 向量隐藏
            for (const source of changed.sources) {
                expect(source).not.toHaveProperty('embedding');
            };

            expect(JSON.stringify(changed)).not.toContain(knowledge.root);
        } finally {
            await knowledge.cleanup();
        };




    });
});