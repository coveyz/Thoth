import { unlink, utimes } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestKnowledge } from "./helpers/createTestKnowledge";
import { createRagIndexManager } from "../src/rag/indexManager";
import { buildRagIndex } from "../src/rag/indexBuilder";
import type { EmbeddingFunction } from "../src/rag/embeddingBatch";


type TestKnowledge = Awaited<ReturnType<typeof createTestKnowledge>>;

let knowledge: TestKnowledge;

beforeEach(async () => {
    knowledge = await createTestKnowledge();
});

afterEach(async () => {
    await knowledge.cleanup();
});

/**
 * 真实 Manager + 真实 Builder
 *  - 只有 Embedding 用 Fake
 *  - 文件读取、切分和快照发布 真实实现
 */
function createTestManager(batchSize = 2) {
    const embed = vi.fn<EmbeddingFunction>(
        async (batch) => batch.map((text) => [
            text.includes('苹果') ? 1 : 0,
            text.includes('香蕉') ? 1 : 0
        ])
    );

    const manager = createRagIndexManager({
        build: () => {
            return buildRagIndex(
                {
                    knowledgeDir: knowledge.root,
                    config: {
                        chunkSize: 200,
                        overlap: 20,
                        embeddingBatchSize: batchSize
                    }
                },
                {
                    embed
                })
        }
    });

    return { embed: embed, manager: manager }
};


describe('本地知识库完整重建', () => {
    it.each([
        {
            extension: 'md',
            content: '# 苹果指南\n苹果存储说明',
            expectedTitle: '苹果指南',
        },
        {
            extension: 'txt',
            content: '苹果存储说明',
            expectedTitle: 'new',
        },
    ])('新增 $extension 文档后完整重建包含新文档', async ({
        extension,
        content,
        expectedTitle,
    }) => {
        await knowledge.write('existing.txt', '香蕉工具说明');

        const { embed, manager } = createTestManager();

        const first = await manager.ensureReady();
        expect(first.documentCount).toBe(1);
        expect(first.chunkCount).toBe(1);

        const addedPath = `new.${extension}`;
        const filePath = await knowledge.write(addedPath, content);
        const modifiedAt = new Date('2026-01-02T03:04:05.000Z');
        await utimes(filePath, modifiedAt, modifiedAt);

        // ensureReady 不自动扫描文件变化
        await expect(manager.ensureReady()).resolves.toBe(first);

        const rebuilt = await manager.rebuild();
        expect(rebuilt).not.toBe(first);
        expect(rebuilt.documentCount).toBe(2);
        expect(rebuilt.chunkCount).toBe(2);

        const addedItems = rebuilt.items.filter(item => item.chunk.path === addedPath);
        expect(addedItems).toHaveLength(1);
        expect(addedItems[0].chunk).toMatchObject({
            title: expectedTitle,
            source: addedPath,
            path: addedPath,
            updatedAt: modifiedAt.toISOString(),
            chunkIndex: 0,
            content,
        });
        expect(addedItems[0].embedding).toEqual([1, 0]);

        /**
        * 初次一批，完整重建又一批。
        * 重建同时处理旧文档和新文档，
        * 而不是只给新文件追加向量。
        */
        expect(embed).toHaveBeenCalledTimes(2);
        expect(embed.mock.calls[1][0]).toHaveLength(2);

        expect(
            rebuilt.items.some((item) => item.chunk.path === 'existing.txt'),
        ).toBe(true);

        expect(first.documentCount).toBe(1);
        expect(first.items).toHaveLength(1);
    });

    it('修改文件后旧内容消失，新内容、标题、时间和向量生效', async () => {
        const filePath = await knowledge.write(
            'report.md',
            '# 旧标题\n苹果旧内容',
        );

        const oldTime = new Date('2026-01-01T00:00:00.000Z');
        await utimes(filePath, oldTime, oldTime);

        const { manager } = createTestManager();
        const first = await manager.ensureReady();
        const oldItem = first.items[0];

        expect(oldItem.embedding).toEqual([1, 0]);

        await knowledge.write(
            'report.md',
            '# 新标题\n香蕉新内容',
        );
        const newTime = new Date('2026-01-02T00:00:00.000Z');
        await utimes(filePath, newTime, newTime);

        const rebuilt = await manager.rebuild();
        const newItem = rebuilt.items[0];

        expect(rebuilt.documentCount).toBe(1);
        expect(rebuilt.chunkCount).toBe(1);

        // 相对路径没变，文档 ID 保持稳定。
        expect(newItem.chunk.documentId).toBe(oldItem.chunk.documentId);
        expect(newItem.chunk).toMatchObject({
            title: '新标题',
            source: 'report.md',
            path: 'report.md',
            updatedAt: newTime.toISOString(),
            content: '# 新标题\n香蕉新内容',
        });

        expect(newItem.embedding).toEqual([0, 1]);

        expect(
            rebuilt.items.some(
                (item) => item.chunk.content.includes('苹果旧内容')
            )
        ).toBe(false);

        // 旧查询持有的快照内容不变。
        expect(oldItem.chunk.content).toContain('苹果旧内容');

        expect(oldItem.chunk.updatedAt).toBe(oldTime.toISOString());
    });

    it('删除文件后对应文档和旧 Chunk 从新快照中消失', async () => {
        const removedFile = await knowledge.write(
            'a.md',
            '# 苹果\n苹果说明',
        );

        await knowledge.write(
            'b.txt',
            '香蕉说明',
        );

        const { manager } = createTestManager();

        const first = await manager.ensureReady();
        const removedChunkIds = new Set(
            first.items
                .filter((item) => item.chunk.path === 'a.md')
                .map((item) => item.chunk.id),
        );

        expect(removedChunkIds.size).toBe(1);
        // 只删除本测试创建的临时文件。
        await unlink(removedFile);

        // 第二次 重建
        const rebuilt = await manager.rebuild();
        expect(rebuilt.documentCount).toBe(1);
        expect(rebuilt.chunkCount).toBe(1);

        expect(
            rebuilt.items.map((item) => item.chunk.path)
        ).toEqual(['b.txt']);

        expect(
            rebuilt.items.every((item) => !removedChunkIds.has(item.chunk.id))
        ).toBe(true);

        expect(first.documentCount).toBe(2);
        expect(first.items).toHaveLength(2);
    });

    it('删除全部文件后成功发布空快照且不重复调用 Embedding', async () => {
        const filePath = await knowledge.write(
            'only.txt',
            '苹果说明',
        );
        const { manager, embed } = createTestManager();

        const first = await manager.ensureReady();
        expect(first.chunkCount).toBe(1);

        await unlink(filePath);

        const empty = await manager.rebuild();
        expect(empty).not.toBe(first);

        expect(empty).toMatchObject({
            items: [],
            documentCount: 0,
            chunkCount: 0,
        });

        expect(manager.getState().status).toMatchObject({
            state: 'ready',
            documentCount: 0,
            chunkCount: 0,
        });

        expect(manager.getSnapshot()).toBe(empty);

        await expect(manager.ensureReady()).resolves.toBe(empty);

        // 只有首次构建调用了 Embedding。
        expect(embed).toHaveBeenCalledTimes(1);
    });

    it('新增非法 UTF-8 文件导致重建失败，修复后可以重试', async () => {
        await knowledge.write(
            'a.txt',
            '苹果说明',
        );
        const { manager, embed } = createTestManager();

        const first = await manager.ensureReady();

        await knowledge.write(
            'broken.txt',
            new Uint8Array([0xc3, 0x28]),
        );

        await expect(manager.rebuild()).rejects.toMatchObject({
            code: 'DOCUMENT_LOAD_ERROR',
        });

        expect(manager.getSnapshot()).toBe(first);
        expect(manager.getState().status.state).toBe('failed');
        expect(manager.getState().lastFailure?.code).toBe('DOCUMENT_LOAD_ERROR');
        // Loader 失败，尚未进入新的 Embedding。
        expect(embed).toHaveBeenCalledTimes(1);
        // 不输出敏感路径
        expect(JSON.stringify(manager.getState())).not.toContain(knowledge.root);

        await knowledge.write(
            'broken.txt',
            '香蕉说明',
        );
        const rebuilt = await manager.rebuild();
        expect(rebuilt.documentCount).toBe(2);
        expect(rebuilt.chunkCount).toBe(2);

        expect(manager.getSnapshot()).toBe(rebuilt);
        expect(manager.getState().status.state).toBe('ready');
        // 清除失败记录
        expect(manager.getState().lastFailure).toBeNull();
    });

    it('后续 Embedding 批次失败不发布半份新索引，之后可以重试', async () => {
        await knowledge.write(
            'a.txt',
            '苹果说明',
        );
        const { manager, embed } = createTestManager(1);

        const first = await manager.ensureReady();

        await knowledge.write(
            'b.txt',
            '香蕉说明',
        );

        const original = new Error('private embedding failure');
        embed
            .mockResolvedValueOnce([[1, 0]])
            .mockRejectedValueOnce(original);

        await expect(manager.rebuild())
            .rejects.toMatchObject({
                code: 'EMBEDDING_ERROR',
                cause: original,
            });

        /**
        * 初次构建调用一次；
        * 重建第一批成功、第二批失败，共再调用两次。
        */
        expect(embed).toHaveBeenCalledTimes(3);

        expect(manager.getSnapshot()).toBe(first);

        expect(manager.getState().status.state).toBe('failed');

        expect(first.documentCount).toBe(1);
        expect(first.items).toHaveLength(1);

        expect(
            first.items.some((item) => item.chunk.path === 'b.txt')
        ).toBe(false);

        expect(JSON.stringify(manager.getState())).not.toContain('private embedding failure');

        // 两个 mockOnce 已消耗，恢复使用默认 Fake 实现。
        const rebuilt = await manager.rebuild();
        expect(rebuilt.documentCount).toBe(2);
        expect(rebuilt.chunkCount).toBe(2);


        expect(
            rebuilt.items.map((item) => ({
                path: item.chunk.path,
                embedding: item.embedding,
            })),
        ).toEqual([
            {
                path: 'a.txt',
                embedding: [1, 0],
            },
            {
                path: 'b.txt',
                embedding: [0, 1],
            },
        ]);


        expect(manager.getState().status.state).toBe('ready');
        expect(manager.getState().lastFailure).toBeNull();
    });
})