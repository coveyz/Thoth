import { AppError, normalizeError } from "../lib/error";

/**
 * 一次 Embedding 调用的最小契约
 */
export type EmbeddingFunction = (text: string[]) => Promise<number[][]>;


/**
 * 分批生成文档向量 (全部成功才返回结果。)
 */
export async function embedTextBatches(
    texts: readonly string[],
    embed: EmbeddingFunction,
    batchSize: number
): Promise<number[][]> {

    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
        throw new AppError('RAG_INDEX_ERROR', { cause: 'Embedding batch size must be a positive integer' });
    };

    if (texts.length === 0) return [];

    const embeddings: number[][] = [];

    for (let start = 0; start < texts.length; start += batchSize) {
        const batch = texts.slice(start, start + batchSize);

        try {
            // 完成一批 再干下一批
            const vectors = await embed(batch);

            if (!Array.isArray(vectors) || vectors.length !== batch.length) {
                throw new AppError('EMBEDDING_ERROR', { cause: 'Embedding count does not match input count' });
            };

            const hasInvalidVector = vectors.some((vector) => !Array.isArray(vector) || vector.length === 0 || !vector.every(Number.isFinite))
            if (hasInvalidVector) {
                throw new AppError('EMBEDDING_ERROR', {cause: 'Embedding vectors must contain finite numbers'})
            };

            // 每批内部顺序由 EmbeddingFunction 保证
            embeddings.push(...vectors);
        } catch (error: unknown) {
            throw normalizeError(error, 'EMBEDDING_ERROR')
        };
    }

    return embeddings;
};