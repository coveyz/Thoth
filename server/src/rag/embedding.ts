import OpenAI from 'openai';

import { AppError, normalizeError } from '../lib/error';
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
        throw new AppError('EMBEDDING_ERROR')
    };

    try {
        const client = new OpenAI({
            baseURL: env.THOTH_EMBEDDING_BASE_URL?.replace(/\/+$/, ''),
            apiKey: env.THOTH_EMBEDDING_API_KEY,
        });

        const response = await client.embeddings.create({
            model: env.THOTH_EMBEDDING_MODEL,
            input: texts,
            encoding_format: 'float',
        });

        /**
         * SDK 返回数据中包含原始输入 index
         * 先排序确保输出向量顺序，与传入 texts的顺序保持一致
         */
        return response.data
            .sort((a, b) => a.index - b.index)
            .map((item) => item.embedding);
    } catch (error) {
        /**
         * 网络、鉴权、限流、响应格式等异常，
         * 统一归类为 EMBEDDING_ERROR。
         */
        throw normalizeError(error, 'EMBEDDING_ERROR')
    }

}
