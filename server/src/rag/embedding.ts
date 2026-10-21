import OpenAI from 'openai';

import { AppError, isAbortError, normalizeError } from '../lib/error';
import type { Env } from '../lib/env';


export type EmbeddingRequestOptions = {
    /**
     * 可选请求取消信号
     * 问题 Embedding 后续传入请求 signal
     * 全局索引构建不绑定某个聊天请求
     */
    signal?: AbortSignal;
};

/** 单次 Provider 请求最多等待30秒 */
const EMBEDDING_REQUEST_TIMEOUT_MS = 30_000;

/**
 * 一批文本转换成对应向量
 *  - 不负责跨批拆分
 *  - 不读文件， 不发送SSE
 */
export async function embedTexts(
    texts: string[],
    env: Env,
    options: EmbeddingRequestOptions = {}
) {
    if (texts.length === 0) return [];

    try {
        // 已取消时，不再创建 Client 或发起请求
        options.signal?.throwIfAborted();

        const apiKey = env.THOTH_EMBEDDING_API_KEY.trim();
        if (!apiKey) {
            throw new AppError('EMBEDDING_ERROR');
        };

        const client = new OpenAI({
            baseURL: env.THOTH_EMBEDDING_BASE_URL.replace(/\/+$/, ''),
            apiKey,
            timeout: EMBEDDING_REQUEST_TIMEOUT_MS,
            maxRetries: 0
        });

        const response = await client.embeddings.create(
            {
                model: env.THOTH_EMBEDDING_MODEL,
                input: texts,
                encoding_format: 'float'
            },
            { signal: options.signal }
        );

        options.signal?.throwIfAborted();

        if (!Array.isArray(response.data) || response.data.length !== texts.length) {
            throw new Error('Embedding response count does not match input count');
        };
        // 创建新数组后排序，避免修改原始响应数组
        // Provider 可以乱序返回， 但每一项都需要包含正确的index
        const ordered = [...response.data].sort((left,right) => left.index - right.index);
        const embeddings: number[][] = [];
        let dimension: number | undefined;

        for (const [expectedIndex, item] of ordered.entries()) {
            // 排序后 index 必须恰好为 0、1、2……
            if (item.index !== expectedIndex) {
                throw new Error('Embedding response indexes are invalid');
            };

            const vector = item.embedding;

            if (!Array.isArray(vector) || vector.length === 0 || !vector.every(Number.isFinite)) {
                throw new Error('Embedding response vector is invalid');
            };

            if (dimension === undefined) {
                dimension = vector.length;
            } else if (vector.length !== dimension) {
                throw new Error('Embedding response dimensions are inconsistent');
            };

            embeddings.push(vector);
        }
        return embeddings;
    } catch (error: unknown) {
        // SDK取消异常可能和原生 AbortError 不同
        // 调用方 signal 已取消，保留取消原因
        options.signal?.throwIfAborted();
        if (isAbortError(error)) throw error;

        throw normalizeError(error, 'EMBEDDING_ERROR');
    }
}