import { describe, expect, it, Mock, vi } from "vitest";

import { embedTextBatches } from '../src/rag/embeddingBatch';
import { AppError, toPublicError } from "../src/lib/error";
import type { EmbeddingFunction } from "../src/rag/embeddingBatch";


describe('Embedding 批处理', () => {
    it('空输入返回空结果且不调用 Embedding', async () => {
        const embed = vi.fn<EmbeddingFunction>();

        await expect(embedTextBatches([], embed, 2)).resolves.toEqual([]);

        expect(embed).not.toHaveBeenCalled();
    });

    it('单批输入只调用一次并返回对应向量', async () => {
        const embed = vi.fn<EmbeddingFunction>().mockResolvedValue([[1, 0], [0, 1]]);

        const result = await embedTextBatches(['第一段', '第二段'], embed, 2);
        expect(embed).toHaveBeenCalledTimes(1);

        expect(embed).toHaveBeenCalledWith(['第一段', '第二段']);
        expect(result).toEqual([[1, 0], [0, 1]]);
    });

    it('多批输入不超过批次上限且最终顺序与输入一致', async () => {
        const embed = vi.fn<EmbeddingFunction>(async (batch) => batch.map((text) => [Number(text)]));

        const result = await embedTextBatches(
            ['1', '2', '3', '4', '5'],
            embed,
            2,
        );

        expect(embed.mock.calls.map(([batch]) => batch)).toEqual([
            ['1', '2'],
            ['3', '4'],
            ['5'],
        ]);

        expect(result).toEqual([
            [1],
            [2],
            [3],
            [4],
            [5],
        ]);
    });

    it('当前批次完成后才开始下一批', async () => {
        let finishFirstBatch!: (vectors: number[][]) => void;

        const firstBatch = new Promise<number[][]>(
            (resolve) => finishFirstBatch = resolve,
        );

        const embed = vi.fn<EmbeddingFunction>()
            .mockImplementationOnce(() => firstBatch)
            .mockResolvedValueOnce([[3]]);

        const pending = embedTextBatches(
            ['1', '2', '3'],
            embed,
            2,
        );

        // 第一批还没完成，第二批不应开始。
        expect(embed).toHaveBeenCalledTimes(1);

        finishFirstBatch([[1], [2]]);

        await expect(pending).resolves.toEqual([
            [1],
            [2],
            [3],
        ]);

        expect(embed).toHaveBeenCalledTimes(2);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1,])('拒绝非法 Batch Size：%s', async (batchSize) => {
        const embed = vi.fn<EmbeddingFunction>();

        await expect(
            embedTextBatches(
                ['正文'],
                embed,
                batchSize,
            ),
        ).rejects.toMatchObject({
            code: 'RAG_INDEX_ERROR',
        });

        expect(embed).not.toHaveBeenCalled();
    });

    it('空输入也不能绕过 Batch Size 校验', async () => {
        const embed = vi.fn<EmbeddingFunction>();

        await expect(embedTextBatches([], embed, 0)).rejects.toMatchObject({
            code: 'RAG_INDEX_ERROR',
        });

        expect(embed).not.toHaveBeenCalled();
    });

    it('返回向量数量少于输入时整次失败', async () => {
        const embed = vi.fn<EmbeddingFunction>()
            .mockResolvedValue([[1]]);

        await expect(
            embedTextBatches(
                ['第一段', '第二段'],
                embed,
                2,
            ),
        ).rejects.toMatchObject({
            code: 'EMBEDDING_ERROR',
        });
    });


    it('返回向量数量多于输入时整次失败', async () => {
        const embed = vi.fn<EmbeddingFunction>()
            .mockResolvedValue([[1], [2]]);

        await expect(
            embedTextBatches(
                ['第一段'],
                embed,
                2,
            ),
        ).rejects.toMatchObject({
            code: 'EMBEDDING_ERROR',
        });
    });

    it.each([
        { name: '空向量', vector: [] },
        { name: '包含 NaN 的向量', vector: [Number.NaN] },
        {
            name: '包含无穷大的向量',
            vector: [Number.POSITIVE_INFINITY],
        },
    ])('拒绝 $name', async ({ vector }) => {
        const embed = vi.fn<EmbeddingFunction>()
            .mockResolvedValue([vector]);

        await expect(
            embedTextBatches(
                ['正文'],
                embed,
                2,
            ),
        ).rejects.toMatchObject({
            code: 'EMBEDDING_ERROR',
        });
    });

    it('后续批次失败时停止调用且不返回部分结果', async () => {
        const original = new Error('private upstream response');

        const embed = vi.fn<EmbeddingFunction>()
            .mockResolvedValueOnce([[1], [2]])
            .mockRejectedValueOnce(original);

        const pending = embedTextBatches(
            ['1', '2', '3', '4', '5'],
            embed,
            2,
        );

        await expect(pending).rejects.toMatchObject({
            code: 'EMBEDDING_ERROR',
            cause: original,
        });

        // 第一批成功，第二批失败，第三批不应调用。
        expect(embed).toHaveBeenCalledTimes(2);

        expect(embed.mock.calls.map(([batch]) => batch)).toEqual([
            ['1', '2'],
            ['3', '4'],
        ]);

        const publicError = await pending.catch(
            (error: unknown) => toPublicError(error),
        );

        expect(publicError).toEqual({
            code: 'EMBEDDING_ERROR',
            message: '知识库检索暂时不可用，请稍后重试',
        });

        expect(JSON.stringify(publicError)).not.toContain('private upstream response');
    });

    it('保留已经分类的 AppError', async () => {
        const original = new AppError('EMBEDDING_ERROR');
        const embed = vi.fn<EmbeddingFunction>().mockRejectedValue(original);

        await expect(
            embedTextBatches(
                ['正文'],
                embed,
                2,
            ),
        ).rejects.toBe(original);
    });

    it('Provider 修改批次数组时不影响原始输入数组', async () => {
        const texts = ['1', '2', '3'];

        const embed = vi.fn<EmbeddingFunction>(
            async (batch) => {
                const vectors =
                    batch.map((text) => [Number(text)]);

                batch[0] = '已被 Provider 修改';

                return vectors;
            },
        );

        await expect(
            embedTextBatches(texts, embed, 2),
        ).resolves.toEqual([
            [1],
            [2],
            [3],
        ]);

        expect(texts).toEqual(['1', '2', '3']);
    });
})

