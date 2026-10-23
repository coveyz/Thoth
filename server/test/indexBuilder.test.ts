import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestKnowledge } from "./helpers/createTestKnowledge";
import { buildRagIndex } from "../src/rag/indexBuilder";
import type { EmbeddingFunction } from "../src/rag/embeddingBatch";
import type { RagIndexConfig, RagRawDocument } from "../src/rag/types";
import { AppError } from "../src/lib/error";


type TestKnowledge = Awaited<ReturnType<typeof createTestKnowledge>>;

let knowledge: TestKnowledge;

const config: RagIndexConfig = {
    chunkSize: 4,
    overlap: 0,
    embeddingBatchSize: 2,
};

const BUILT_AT = '2026-01-02T03:04:05.000Z';


function createDocument(
    id: string,
    content = 'ABCD',
): RagRawDocument {
    return {
        id,
        title: id,
        source: `${id}.txt`,
        path: `${id}.txt`,
        updatedAt: '2026-01-01T00:00:00.000Z',
        content,
    };
};

beforeEach(async () => {
    knowledge = await createTestKnowledge();
});

afterEach(async () => {
    await knowledge.cleanup();
});


describe('RAG 索引构建器', () => {
    it('从 Markdown 和 TXT 构建完整快照并正确绑定向量', async () => {
        await knowledge.write('a.md', '# A\nBBBB');
        await knowledge.write('nested/b.txt', 'CCCC');

        const embed = vi.fn<EmbeddingFunction>(
            async (batch) =>
                batch.map((text) => {
                    const content =
                        text.split('\n').at(-1);

                    if (content === '# A') return [1, 0];
                    if (content === 'BBBB') return [0, 1];
                    if (content === 'CCCC') return [1, 1];

                    throw new Error(
                        'Unexpected embedding text in test',
                    );
                }),
        );

        const result = await buildRagIndex(
            {
                knowledgeDir: knowledge.root,
                config,
            },
            {
                embed,
                now: () => new Date(BUILT_AT),
            },
        );

        expect(result.snapshot).toMatchObject({
            documentCount: 2,
            chunkCount: 3,
            builtAt: BUILT_AT,
        });

        expect(result.diagnostics).toEqual([]);

        expect(
            result.snapshot.items.map((item) => ({
                path: item.chunk.path,
                content: item.chunk.content,
                embedding: item.embedding,
            }))
        ).toEqual([
            {
                path: 'a.md',
                content: '# A',
                embedding: [1, 0],
            },
            {
                path: 'a.md',
                content: 'BBBB',
                embedding: [0, 1],
            },
            {
                path: 'nested/b.txt',
                content: 'CCCC',
                embedding: [1, 1],
            },
        ]);

        // 三个 Chunk 按 2 + 1 分批。
        expect(
            embed.mock.calls.map(([batch]) => batch),
        ).toEqual([
            [
                'A\na.md\n# A',
                'A\na.md\nBBBB',
            ],
            [
                'b\nnested/b.txt\nCCCC',
            ],
        ]);

        const [first, second, third] = result.snapshot.items;

        expect(first.chunk.documentId)
            .toBe(second.chunk.documentId);

        expect(third.chunk.documentId)
            .not.toBe(first.chunk.documentId);

        expect(
            result.snapshot.items.map(
                (item) => item.chunk.chunkIndex,
            ),
        ).toEqual([0, 1, 0]);

        expect(JSON.stringify(result))
            .not.toContain(knowledge.root);
    });

    it('空知识库产生可用空快照且不调用 Embedding', async () => {
        const embed = vi.fn<EmbeddingFunction>();

        const result = await buildRagIndex(
            {
                knowledgeDir: knowledge.root,
                config,
            },
            {
                embed,
                now: () => new Date(BUILT_AT),
            },
        );

        expect(result).toEqual({
            snapshot: {
                items: [],
                documentCount: 0,
                chunkCount: 0,
                builtAt: BUILT_AT,
            },
            diagnostics: [],
        });

        expect(embed).not.toHaveBeenCalled();
    });

    it('跳过空白文档并保留 Loader 的诊断', async () => {
        await knowledge.write('empty.md', ' \n\t ');
        await knowledge.write('valid.txt', 'ABCD');

        const embed = vi.fn<EmbeddingFunction>()
            .mockResolvedValue([[1, 0]]);

        const result = await buildRagIndex(
            {
                knowledgeDir: knowledge.root,
                config,
            },
            { embed },
        );

        expect(result.snapshot.documentCount).toBe(1);
        expect(result.snapshot.chunkCount).toBe(1);

        expect(result.diagnostics).toEqual([
            {
                code: 'EMPTY_DOCUMENT',
                path: 'empty.md',
                message: '文档为空，已跳过',
            },
        ]);
    });


    it('Loader 失败时保留原错误且不调用 Embedding', async () => {
        const original =
            new AppError('DOCUMENT_LOAD_ERROR');

        const loadDocuments = vi.fn(async () => {
            throw original;
        });

        const embed = vi.fn<EmbeddingFunction>();

        await expect(
            buildRagIndex(
                {
                    knowledgeDir: knowledge.root,
                    config,
                },
                {
                    embed,
                    loadDocuments
                },
            ),
        ).rejects.toBe(original);

        expect(embed).not.toHaveBeenCalled();
    });

    it('后续批次失败时拒绝整个构建且不执行剩余批次', async () => {
        const original = new AppError('EMBEDDING_ERROR');

        const loadDocuments = vi.fn(async () => ({
            documents: [
                createDocument('doc-a', 'ABCDEFGHIJKL'),
            ],
            diagnostics: [],
        }));

        const embed = vi.fn<EmbeddingFunction>()
            .mockResolvedValueOnce([[1, 0]])
            .mockRejectedValueOnce(original);

        await expect(
            buildRagIndex(
                {
                    knowledgeDir: knowledge.root,
                    config: {
                        ...config,
                        embeddingBatchSize: 1,
                    },
                },
                { embed, loadDocuments },
            ),
        ).rejects.toBe(original);

        // 三个 Chunk；第二批失败，所以第三批不执行。
        expect(embed).toHaveBeenCalledTimes(2);
    });

    it('拒绝不同批次返回不同维度的向量', async () => {
        const loadDocuments = vi.fn(async () => ({
            documents: [
                createDocument('doc-a', 'ABCDEFGH'),
            ],
            diagnostics: [],
        }));

        const embed = vi.fn<EmbeddingFunction>()
            .mockResolvedValueOnce([[1, 0]])
            .mockResolvedValueOnce([[1, 0, 0]]);

        await expect(
            buildRagIndex(
                {
                    knowledgeDir: knowledge.root,
                    config: {
                        ...config,
                        embeddingBatchSize: 1,
                    },
                },
                { embed, loadDocuments },
            ),
        ).rejects.toMatchObject({
            code: 'RAG_INDEX_ERROR',
        });

        expect(embed).toHaveBeenCalledTimes(2);
    });

    it('拒绝重复文档 ID，避免索引身份冲突', async () => {
        const first = createDocument('same-id');

        const loadDocuments = vi.fn(async () => ({
            documents: [
                first,
                {
                    ...first,
                    path: 'another.txt',
                    source: 'another.txt',
                },
            ],
            diagnostics: [],
        }));

        const embed = vi.fn<EmbeddingFunction>();

        await expect(
            buildRagIndex(
                {
                    knowledgeDir: knowledge.root,
                    config,
                },
                { embed, loadDocuments },
            ),
        ).rejects.toMatchObject({
            code: 'RAG_INDEX_ERROR',
        });

        expect(embed).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'chunkSize 为零',
            invalidConfig: {
                ...config,
                chunkSize: 0,
            },
        },
        {
            name: 'chunkSize 为小数',
            invalidConfig: {
                ...config,
                chunkSize: 1.5,
            },
        },
        {
            name: 'overlap 为负数',
            invalidConfig: {
                ...config,
                overlap: -1,
            },
        },
        {
            name: 'overlap 等于 chunkSize',
            invalidConfig: {
                ...config,
                overlap: config.chunkSize,
            },
        },
        {
            name: 'Batch Size 为零',
            invalidConfig: {
                ...config,
                embeddingBatchSize: 0,
            },
        },
        {
            name: 'Batch Size 为 NaN',
            invalidConfig: {
                ...config,
                embeddingBatchSize: Number.NaN,
            },
        },
    ])('读取文件前拒绝非法配置：$name', async ({
        invalidConfig,
    }) => {
        const loadDocuments = vi.fn(async () => ({
            documents: [],
            diagnostics: [],
        }));

        const embed = vi.fn<EmbeddingFunction>();

        await expect(
            buildRagIndex(
                {
                    knowledgeDir: knowledge.root,
                    config: invalidConfig,
                },
                { embed, loadDocuments },
            ),
        ).rejects.toMatchObject({
            code: 'RAG_INDEX_ERROR',
        });

        expect(loadDocuments).not.toHaveBeenCalled();
        expect(embed).not.toHaveBeenCalled();
    });

    it('复制输入与向量，防止外部引用修改已构建结果', async () => {
        const document = createDocument('doc-a');
        const vector = [1, 0];

        const loadDocuments = vi.fn(async () => ({
            documents: [document],
            diagnostics: [],
        }));

        const embed = vi.fn<EmbeddingFunction>()
            .mockResolvedValue([vector]);

        const result = await buildRagIndex(
            {
                knowledgeDir: knowledge.root,
                config,
            },
            { embed, loadDocuments },
        );

        document.title = '外部修改后的标题';
        vector[0] = 999;

        expect(result.snapshot.items[0].chunk.title)
            .toBe('doc-a');

        expect(result.snapshot.items[0].embedding)
            .toEqual([1, 0]);
    });

    it('只有全部向量完成后才记录 builtAt', async () => {
        let finishEmbedding!:(vectors: number[][]) => void;

        let notifyStarted!: () => void;

        const started = new Promise<void>((resolve) => {
            notifyStarted = resolve;
        });

        const embed = vi.fn<EmbeddingFunction>(() => {
            notifyStarted();

            return new Promise<number[][]>((resolve) => {
                finishEmbedding = resolve;
            });
        });

        const loadDocuments = vi.fn(async () => ({
            documents: [createDocument('doc-a')],
            diagnostics: [],
        }));

        const now = vi.fn(() => new Date(BUILT_AT));

        const pending = buildRagIndex(
            {
                knowledgeDir: knowledge.root,
                config,
            },
            { embed, loadDocuments, now },
        );

        await started;

        expect(now).not.toHaveBeenCalled();

        finishEmbedding([[1, 0]]);

        const result = await pending;

        expect(now).toHaveBeenCalledTimes(1);
        expect(result.snapshot.builtAt).toBe(BUILT_AT);
    });
});
