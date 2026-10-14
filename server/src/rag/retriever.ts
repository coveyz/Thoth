import { ragDocuments } from './document';
import { embedTexts } from './embedding';
import { cosineSimilarity } from './similarity';
import { DEFAULT_RAG_RETRIEVAL_OPTIONS } from './config';
import type { Env } from '../lib/env';
import type { RagSearchResult, RagSource } from './types';

/** 
 * 文档定向存量 🧭
 * 文档内容不会频繁变化， 内存中缓存向量
 * 第一次 RAG 请求会计算， 后期请求直接复用
 */
let documentEmbeddingsPromise: Promise<number[][]> | null = null;

const getDocumentEmbeddings = (
    env: Env
): Promise<number[][]> => {
    if (!documentEmbeddingsPromise) {
        const texts = ragDocuments.map(document => {
            return [
                document.title,
                document.source,
                document.content
            ].join('\n');
        });

        documentEmbeddingsPromise = embedTexts(texts, env).catch((error) => {
            documentEmbeddingsPromise = null; // Reset the promise on error to allow retrying
            throw error;
        })
    };

    return documentEmbeddingsPromise;
}

/** 检索 TopK文档片段
 * 核心流程：
 *  1. 给用户问题生成 queryEmbedding
 *  2. 获取或有文档chunk 的 documentEmbedding
 *  3. 每个 chunk 和 query 做 cosineSimilarity
 *  4. 按照 从高到低排序
 *  5. 过滤掉低于 MIN_RAG_SCORE 的 chunk
 *  6. 截取 topK
 */
export const retrieveSources = async (
    query: string,
    env: Env,
    topK = DEFAULT_RAG_RETRIEVAL_OPTIONS.topK
): Promise<RagSearchResult> => {

    const [queryEmbedding] = await embedTexts([query], env);
    const documentEmbeddings = await getDocumentEmbeddings(env);

    const sources: RagSource[] = ragDocuments
        .map((document, index) => {
            return {
                id: document.id,
                documentId: document.documentId,
                title: document.title,
                source: document.source,
                path: document.path,
                updatedAt: document.updatedAt,
                chunkIndex: document.chunkIndex,
                content: document.content,
                score: cosineSimilarity(queryEmbedding, documentEmbeddings[index]),
            }
        })
        .sort((a,b) => b.score - a.score)
        .filter(source => source.score >= DEFAULT_RAG_RETRIEVAL_OPTIONS.minScore)
        .slice(0, topK);

    return {
        sources
    }
}