import { ragDocuments } from './document';
import { embedTexts } from './embedding';
import { cosineSimilarity } from './similarity';
import type { Env } from '../lib/env';
import type { RagSearchResult, RagSource } from './types';


/** 阶段5目标，命中相关文档时，正常返回sources，问题明显不在时 不硬塞 */
const MIN_RAG_SCORE = 0.55;

/** 
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

/** 检索 TopK文档片段 */
export const retrieveSources = async (
    query: string,
    env: Env,
    topK = 3
): Promise<RagSearchResult> => {

    const [queryEmbedding] = await embedTexts([query], env);
    const documentEmbeddings = await getDocumentEmbeddings(env);

    const sources: RagSource[] = ragDocuments
        .map((document, index) => {
            return {
                ...document,
                score: cosineSimilarity(queryEmbedding, documentEmbeddings[index]),
            }
        })
        .sort((a,b) => b.score - a.score)
        .filter(source => source.score >= MIN_RAG_SCORE)
        .slice(0, topK);

    return {
        sources
    }
}