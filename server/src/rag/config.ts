import type { RagIndexConfig, RagRetrieverOptions } from "./types";


/**
 * 索引构建的默认配置
 */
export const DEFAULT_RAG_INDEX_CONFIG: Readonly<RagIndexConfig> = {
    chunkSize: 180,
    overlap: 40,
    embeddingBatchSize: 32,
};

/**
 * 检索默认配置
 */
export const DEFAULT_RAG_RETRIEVAL_OPTIONS: Readonly<RagRetrieverOptions> = {
    topK: 3,
    minScore: 0.55,
};
