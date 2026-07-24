import OpenAI from 'openai';
import type { Env } from '../lib/env';


/** 
 * 多段文本转换成向量
 * - 文档 chunks 可以批量发送，减少http请求次数
 * - 文本数组 -> 向量数组
 */
export const embedTexts = async (
    texts: string[],
    env: Env,
) => {
    if (texts.length === 0) return [];

    if (!env.THOTH_EMBEDDING_API_KEY) {
        throw new Error(
            'THOTH_EMBEDDING_API_KEY is required when RAG embedding is enabled'
        );
    };

    const client = new OpenAI({
        baseURL: env.THOTH_EMBEDDING_BASE_URL?.replace(/\/+$/, ''),
        apiKey: env.THOTH_EMBEDDING_API_KEY,
    });

    const response = await client.embeddings.create({
        model: env.THOTH_EMBEDDING_MODEL,
        input: texts,
        encoding_format: 'float',
    });

    return response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
}
