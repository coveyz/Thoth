import { describe, expect, it } from "vitest";

import { createTestKnowledge } from "./helpers/createTestKnowledge";
import { chunkDocument, chunkText } from "../src/rag/chunker";
import { AppError, toPublicError } from "../src/lib/error";
import type { RagRawDocument } from "../src/rag/types";
import { loadKnowledgeDocuments } from "../src/rag/loader";


function createRawDocument(overrides: Partial<RagRawDocument> = {}) {
    return {
        id: 'doc-example',
        title: '示例文档',
        source: 'guides/example.md',
        path: 'guides/example.md',
        updatedAt: '2026-01-02T03:04:05.000Z',
        content: 'ABCDEFGHIJ',
        ...overrides,
    }
};

describe('字符级正文切分', () => {
    it('短文本生成一个 Chunk', async () => {
        expect(chunkText('ABC', { chunkSize: 5, overlap: 0 })).toEqual(['ABC'])
    });

    it('长文本按顺序生成多个 Chunk', async () => {
        expect(
            chunkText('ABCDEFGHIJ', { chunkSize: 4, overlap: 0 })
        ).toEqual([
            'ABCD',
            'EFGH',
            'IJ',
        ]);
    });

    it('相邻窗口保留配置数量的重复内容', () => {
        expect(
            chunkText('ABCDEFGHIJ', {
                chunkSize: 4,
                overlap: 1,
            }),
        ).toEqual([
            'ABCD',
            'DEFG',
            'GHIJ',
        ]);
    });

    it.each(['', ' \n\t ',])('空白正文不产生 Chunk：%j', (text) => {
        expect(chunkText(text)).toEqual([]);
    });

    it('统一换行符并压缩连续空行', () => {
        expect(
            chunkText(' \r\nA\r\n\r\n\r\nB\r\n ', {
                chunkSize: 20,
                overlap: 0,
            }),
        ).toEqual(['A\n\nB']);
    });

    it('省略配置时使用默认切分大小和重叠长度', () => {
        const chunks = chunkText('A'.repeat(181));
        expect(chunks.map((chunk) => chunk.length))
            .toEqual([180, 41]);
    });

    it.each([
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
    ])('拒绝非法 chunkSize：%s', (chunkSize) => {
        expect(() =>
            chunkText('ABC', {
                chunkSize,
                overlap: 0,
            }),
        ).toThrowError(AppError);
    });

    it.each([
        -1,
        5,
        6,
        0.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
    ])('拒绝非法 overlap：%s', (overlap) => {
        expect(() =>
            chunkText('ABC', {
                chunkSize: 5,
                overlap,
            }),
        ).toThrowError(AppError);
    });

    it('空正文也不能绕过配置校验', () => {
        expect(() =>
            chunkText('', {
                chunkSize: 0,
                overlap: 0,
            }),
        ).toThrowError(AppError);
    });

    it('非法配置返回稳定错误码和安全文案', () => {
        let caught: unknown;

        try {
            chunkText('ABC', {
                chunkSize: 0,
                overlap: 0,
            });
        } catch (error: unknown) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(AppError);

        expect(toPublicError(caught)).toEqual({
            code: 'RAG_INDEX_ERROR',
            message: '知识库索引构建失败，请稍后重试',
        });

        expect(caught).toMatchObject({
            cause: expect.any(Error),
        });
    });




})

describe('文档到 Chunk 的转换', () => {
    it('传播完整 metadata 且不修改原始文档', () => {
        const document = createRawDocument();
        const original = { ...document };

        const chunks = chunkDocument(document, {
            chunkSize: 4,
            overlap: 1,
        });

        expect(chunks).toEqual([
            {
                id: 'doc-example-chunk-0',
                documentId: 'doc-example',
                title: '示例文档',
                source: 'guides/example.md',
                path: 'guides/example.md',
                updatedAt: '2026-01-02T03:04:05.000Z',
                chunkIndex: 0,
                content: 'ABCD',
            },
            {
                id: 'doc-example-chunk-1',
                documentId: 'doc-example',
                title: '示例文档',
                source: 'guides/example.md',
                path: 'guides/example.md',
                updatedAt: '2026-01-02T03:04:05.000Z',
                chunkIndex: 1,
                content: 'DEFG',
            },
            {
                id: 'doc-example-chunk-2',
                documentId: 'doc-example',
                title: '示例文档',
                source: 'guides/example.md',
                path: 'guides/example.md',
                updatedAt: '2026-01-02T03:04:05.000Z',
                chunkIndex: 2,
                content: 'GHIJ',
            },
        ]);

        expect(document).toEqual(original);
    });

    it('相同文档和切分配置重复执行时 Chunk ID 稳定', () => {
        const document = createRawDocument();
        const options = {
            chunkSize: 4,
            overlap: 1,
        };

        const first = chunkDocument(document, options);
        const second = chunkDocument(document, options);

        expect(
            second.map((chunk) => chunk.id),
        ).toEqual(
            first.map((chunk) => chunk.id),
        );

        expect(
            first.map((chunk) => chunk.chunkIndex),
        ).toEqual([0, 1, 2]);
    });

    it('不同原始文档不会生成相同 Chunk ID', () => {
        const first = chunkDocument(
            createRawDocument({ id: 'doc-first' }),
        );

        const second = chunkDocument(
            createRawDocument({ id: 'doc-second' }),
        );

        expect(first[0].id).not.toBe(second[0].id);
    });

    it.each(['', ' \n\t '])('空白原始文档不生成 Chunk：%j', (content) => {
        const chunks = chunkDocument(
            createRawDocument({ content }),
        );

        expect(chunks).toEqual([]);
    });

    it('Loader 的真实文件 metadata 完整传播到每个 Chunk', async () => {
        const knowledge = await createTestKnowledge();

        try {
            await knowledge.write(
                'guides/rag.md',
                '# 检索指南\n\nABCDEFGHIJ',
            );

            const loaded = await loadKnowledgeDocuments(knowledge.root);
            expect(loaded.documents).toHaveLength(1);

            const document = loaded.documents[0];

            const chunks = chunkDocument(document, {
                chunkSize: 8,
                overlap: 2,
            });

            expect(chunks.length).toBeGreaterThan(1);

            for (const [index, chunk] of chunks.entries()) {
                expect(chunk).toMatchObject({
                    id: `${document.id}-chunk-${index}`,
                    documentId: document.id,
                    title: '检索指南',
                    source: 'guides/rag.md',
                    path: 'guides/rag.md',
                    updatedAt: document.updatedAt,
                    chunkIndex: index,
                });

                expect(chunk.content.trim()).not.toBe('');
                expect(chunk).not.toHaveProperty('score');
                expect(chunk).not.toHaveProperty('embedding');
            };

            expect(JSON.stringify(chunks)).not.toContain(knowledge.root);
        } finally {
            await knowledge.cleanup();
        };
    })
})