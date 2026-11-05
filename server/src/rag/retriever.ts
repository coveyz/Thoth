import { cosineSimilarity } from './similarity';
import { DEFAULT_RAG_RETRIEVAL_OPTIONS } from './config';
import { AppError, isAbortError, normalizeError } from '../lib/error';
import type { EmbeddingRequestOptions } from './embedding';
import type { RagIndexSnapshot, RagRetrieverOptions, RagSearchResult, RagSource } from './types';

/**
 * 问题 Embedding 的注入契约
 *  - 与 Batch 不同，这里允许传入请求取消信号
 *  - 返回结果仍按输入文本顺序对应
 */
export type QueryEmbeddingFunction = (texts: string[], options?: EmbeddingRequestOptions) => Promise<number[][]>;

export type RetrieveSnapshotSourcesInput = {
    query: string;
    snapshot: RagIndexSnapshot;
    options?: Partial<RagRetrieverOptions>;
    signal?: AbortSignal;
};

/**
 * 从已经构建好的 完整快照中 进行检索
 *  - 不读取文件，不生成文档向量，不触发索引构建
 */
export async function retrieveSourcesFromSnapshot(
    input: RetrieveSnapshotSourcesInput,
    embedQuery: QueryEmbeddingFunction
): Promise<RagSearchResult> {
    // 开始取得本次查询使用的快照索引
    // 后续异步操作期间不重新读取 Manager
    const { query, snapshot, signal } = input;

    signal?.throwIfAborted();

    const topK = input.options?.topK ?? DEFAULT_RAG_RETRIEVAL_OPTIONS.topK;
    const minScore = input.options?.minScore ?? DEFAULT_RAG_RETRIEVAL_OPTIONS.minScore;

    if (
        !Number.isSafeInteger(topK)
        || topK <= 0
        || !Number.isFinite(minScore)
        || minScore < -1
        || minScore > 1
    ) {
        throw new AppError('RAG_INDEX_ERROR', {
            cause: 'Retrieval options are invalid'
        })
    };

    // 空快照是正常 no-hit, 没有侯选内容时 无需调用Embedding
    if (snapshot.items.length === 0) {
        return { sources: [] }
    };

    let vectors: number[][];


    try {
        // 只对当前问题生成向量
        vectors = await embedQuery([query], { signal });
        // 防止忽略取消的上游在返回后继续评分
        signal?.throwIfAborted();
    } catch (error: unknown) {
        signal?.throwIfAborted();

        if (isAbortError(error)) {
            throw error;
        };

        throw normalizeError(error, 'EMBEDDING_ERROR');
    };

    if (
        !Array.isArray(vectors)
        || vectors.length !== 1
        || !Array.isArray(vectors[0])
        || vectors[0].length === 0
        || !vectors[0].every(Number.isFinite)
    ) {
        throw new AppError('EMBEDDING_ERROR', {
            cause: new Error('Query embedding response is invalid')
        })
    };

    const queryEmbedding = vectors[0];

    const sources = snapshot.items.map(item => {
        // 维度不一致属于索引与查询不兼容
        // 不能悄悄当成低相关结果
        if (item.embedding.length !== queryEmbedding.length) {
            throw new AppError('RAG_INDEX_ERROR', {
                cause: new Error('Query and index embedding dimensions differ')
            });
        };

        const score = cosineSimilarity(queryEmbedding, item.embedding);

        if (!Number.isFinite(score)) {
            throw new AppError('RAG_INDEX_ERROR', {
                cause: 'Similarity score is not finite'
            });
        };

        const chunk = item.chunk;

        return  {
            id: chunk.id,
            documentId: chunk.documentId,
            title: chunk.title,
            source: chunk.source,
            path: chunk.path,
            updatedAt: chunk.updatedAt,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            score: score
        }
    });


    return {
        sources: sources
            .filter(source => source.score >= minScore)
            .sort((left, right) => right.score - left.score)
            .slice(0, topK)
    }
}