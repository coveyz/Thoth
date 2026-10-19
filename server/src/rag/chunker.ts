import { AppError } from "../lib/error";
import { DEFAULT_RAG_INDEX_CONFIG } from "./config";
import type { RagDocument, RagRawDocument } from "./types";

export type ChunkTextOptions = {
    /** 每个 chunk 的最大字符数 */
    chunkSize?: number;
    /** 相邻chunk 重复字符数，用来保留上下文连贯性 */
    overlap?: number;
}

/** 解析&&校验 切分配置 */
function resolveChunkOptions(options: ChunkTextOptions) {
    const chunkSize = options.chunkSize ?? DEFAULT_RAG_INDEX_CONFIG.chunkSize;
    const overlap = options.overlap ?? DEFAULT_RAG_INDEX_CONFIG.overlap;

    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
        throw new AppError('RAG_INDEX_ERROR', {
            cause: new Error('chunkSize must be a positive safe integer')
        })
    };

    if (!Number.isSafeInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
        throw new AppError('RAG_INDEX_ERROR', {
            cause: new Error('overlap must be a non-negative safe integer smaller than chunkSize')
        })
    };

    return { chunkSize, overlap };
}

/**
 * 字符级切分
 *  - 输入： 正文，可选切分配置
 *  - 输出： 按原文顺序排列的非空文本片段
 */
export function chunkText(text: string, options: ChunkTextOptions = {}): string[] {
    const { chunkSize, overlap } = resolveChunkOptions(options);

    /**
     * 统一换行符，连续3个换行压成2个，删除
     */
    const normalized = text
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!normalized) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < normalized.length) {
        const end = Math.min(start + chunkSize, normalized.length);
        const content = normalized.slice(start, end).trim();

        // 某个窗口可能只有空白，不产生空 Chunk
        if (content) {
            chunks.push(content);
        };

        if (end >= normalized.length) break;

        start = end - overlap;
    };

    return chunks;
};

/**
 * 原始文档 转换成 完整metadata的Chunks
 */
export function chunkDocument(
    document: Readonly<RagRawDocument>,
    options: ChunkTextOptions = {}
): RagDocument[] {
    const contents = chunkText(document.content, options);

    return contents.map((content, chunkIndex) => ({
        id: `${document.id}-chunk-${chunkIndex}`,
        documentId: document.id,
        title: document.title,
        source: document.source,
        path: document.path,
        updatedAt: document.updatedAt,
        chunkIndex,
        content
    }));
};