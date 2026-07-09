export type RagRawDocument = {
    id: string;
    title: string;
    source: string;
    content: string;
};


/** 可以被检索的 文档片段 */
export type RagDocument = {
    id: string;
    /** 原始文档id */
    documentId: string;
    title: string;
    source: string;
    /** 当前 chunk 在原始文档的序号， 从0开始 */
    chunkIndex: number;
    /** 真正塞入 prompt 的片段正文 */
    content: string;
}

/** 返回给 编排层，前端，模型prompt 引用来源 */
export type RagSource = {
    id: string;
    documentId: string;
    title: string;
    source: string;
    chunkIndex: number;
    content: string;
    score: number
}

/** RAG 检索函数的返回值 */
export type RagSearchResult = {
    sources: RagSource[];
}