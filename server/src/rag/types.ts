
/** 可以被检索的 文档片段 */
export type RagDocument = {
    id: string;
    /** 引用来源 */
    title: string;
    /** 引用来源 */
    source: string;
    /** 塞进 prompt 正文 */
    content: string;
}

/** 返回给 编排层，前端，模型prompt 引用来源 */
export type RagSource = {
    id: string;
    title: string;
    source: string;
    content: string;
    score: number
}

/** RAG 检索函数的返回值 */
export type RagSearchResult = {
    sources: RagSource[];
}