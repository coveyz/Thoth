export type ChunkTextOptions = {
    /** 每个 chunk 的最大字符数 */
    chunkSize?: number;
    /** 相邻chunk 重复字符数，用来保留上下文连贯性 */
    overlap?: number;
}

/**
 * 原始文档切成chunks 
 * TODO: 阶段 2 先使用字符级切分：
 * - 简单、可控、容易调试
 * - 中文场景下比英文单词切分更直观
 * - 后面可以替换成 markdown heading / token based chunker
*/
export const chunkText = (
    text: string,
    options: ChunkTextOptions = {}
): string[] => {
    const chunkSize = options.chunkSize ?? 180;
    const overlap = options.overlap ?? 40;

    const normalized = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!normalized) return [];

    if (chunkSize <= 0) {
        throw new Error('chunkSize must be greater than 0')
    };

    if (overlap < 0 || overlap >= chunkSize) {
        throw new Error('overlap must be >= 0 and smaller than chunkSize');
    };

    const chunks: string[] = [];

    let start = 0;

    while (start < normalized.length) {
        const end = Math.min(start + chunkSize, normalized.length);
        const chunk = normalized.slice(start, end).trim();

        if (chunk) {
            chunks.push(chunk);
        };

        if (end >= normalized.length) break;

        start = end - overlap;
    };

    return chunks;
}