import type { AppErrorCode } from "../lib/error";

/**
 * 原始文档
 *  - 由 Loader 创建
 *      - 一份 合法，非空文件对应一份原始文档
 */
export type RagRawDocument = {
    /** 根据规范化相对路径稳定生成的文档 ID */
    id: string;
    /** Markdown 一级标题，或文件名 */
    title: string;
    /** 面向用户展示的相对来源 */
    source: string;
    /** UTF-8 文档正文 */
    content: string;
    /** 相对知识库根目录的路径，统一使用 / */
    path: string;
    /** 原始文件修改时间，不是索引构建时间 */
    updatedAt: string;
};


/** 
 * 可以参与检索的文档片段，也就是 Chunk
 */
export type RagDocument = {
    /** Chunk ID，由文档 ID 和 Chunk 序号生成 */
    id: string;
    /** 对应 RagRawDocument.id  */
    documentId: string;
    title: string;
    source: string;
    path: string;
    updatedAt: string;
    /** 在原始文档中的 Chunk 序号，从 0 开始 */
    chunkIndex: number;
    /** 当前片段正文 */
    content: string;
}

/** 
 * 返回给 编排层，前端，模型prompt 公开引用
 *  - 独立列出字段，明确公开边界
 *  - 不包含 Embedding 向量，机器绝对路径或内部错误
 */
export type RagSource = {
    id: string;
    documentId: string;
    title: string;
    source: string;
    path: string;
    updatedAt: string;
    chunkIndex: number;
    content: string;
    score: number
};

/** 
 * Retriever 返回结构
 *  - 保存现有接口形状
 */
export type RagSearchResult = {
    sources: RagSource[];
};

/**
 * 索引构建配置
 *  - 改变这些配置后，需要重新构建文档索引
 *  - knowledgeDir 作为 Loader 的输入，不放进切片配置
 */
export type RagIndexConfig = {
    chunkSize: number;
    overlap: number;
    embeddingBatchSize: number;
};

/**
 * 查询配置
 *  - 改变 TopK 或 阀值， 不需要重新生成文档向量
 */
export type RagRetrieverOptions = {
    topK: number;
    minScore: number;
};

/**
 * 一条完整索引记录
 *  - chunk 与它向量绑定在同一个对象中
 */
export type RagIndexItem = {
    readonly chunk: Readonly<RagDocument>;
    readonly embedding: readonly number[];
};

/**
 * 一次完整构建的结构
 *  - Builder 先在局部变量中构建
 *  - 所有步骤成功后 Manager 才能发布这份快照
 */
export type RagIndexSnapshot = {
    readonly items: readonly RagIndexItem[];
    /** 实际接入非空文档数量 */
    readonly documentCount: number;
    /** 包含快找 chunk 数量 */
    readonly chunkCount: number;
    /** 本次索引构建完成时间  */
    readonly builtAt: string;
};

/**
 *  最近一次构建失败的安全摘要
 *  - message 必须来自统一错误体系的安全文案（不能直接保存未知异常的原始 message）
 */
export type RagIndexFailure = {
    failedAt: string;
    code: AppErrorCode;
    message: string;
};

/**
 * 最近一次构建任务的状态
 *  * failed 描述构建失败 （不代表一定没有可查询的旧快照）
 */
export type RagIndexStatus =
    | { state: 'pending' }
    | { state: 'indexing', startedAt: string }
    | {
        state: 'ready',
        builtAt: string;
        documentContent: number;
        chunkCount: number;
    }
    | {
        state: 'failed',
        failure: RagIndexFailure;
    };

/**
 * Manager 对外提供的服务端内部状态视图
 *  - currentSnapshot 表示当前可用的索引快照
 *  - status 表示最近一次构建任务的状态
 *  - lastFailure 表示最近一次构建失败的安全摘要
 */
export type RagIndexState = {
    readonly currentSnapshot: RagIndexSnapshot | null;
    readonly status: RagIndexStatus;
    readonly lastFailure: RagIndexFailure | null;
};