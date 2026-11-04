import * as path from 'node:path';

import { DEFAULT_RAG_INDEX_CONFIG } from './config';
import { embedTexts } from './embedding';
import { createRagIndexManager } from './indexManager';
import { buildRagIndex } from './indexBuilder';
import type { RagIndexManager } from './indexManager';
import type { QueryEmbeddingFunction } from './retriever';
import type { Env } from '../lib/env';
import type { EmbeddingFunction } from './embeddingBatch';


/**
 * 当前文件位于 server/src/rag
 *  - 向上找两级 得到server 目录
 * 
 * 当前 Server 使用 tsx运行 CommonJS 模块
 *  __dirname 表示当前模块所在目录
 */
const SERVER_ROOT = path.resolve(__dirname, '../..');


/**
 * 相对目录统一以 server 为基准
 *  - 配置本身是绝对路径时，path.resolve 会保持绝对位置
 *  - 只解析路径 不读取文件系统
 */
export function resolveKnowledgeDirectory(
    configureDirectory: string
) {
    return path.resolve(
        SERVER_ROOT,
        configureDirectory
    );
};

/**
 * RAG 问答需要的运行时依赖
 *  - 不包含 HTTP/SSE 对象， 也不会向前端公开
 */
export type RagRuntime = {
    indexManager: RagIndexManager;
    embedQuery: QueryEmbeddingFunction
};

/**
 * 每次调用创建一份独立 Runtime
 * 创建时不读取文件，不构建索引，不调用Embedding
 */
export function createRagRuntime(
    env: Env
): RagRuntime {
    const knowledgeDir = resolveKnowledgeDirectory(env.THOTH_KNOWLEDGE_DIR);

    const config = {
        ...DEFAULT_RAG_INDEX_CONFIG,
        embeddingBatchSize: env.THOTH_EMBEDDING_BATCH_SIZE
    };

    /**
     * 文档向量属于共享索引构建
     * 不接收 某个聊天的 AbortSignal
     */
    const embedDocuments: EmbeddingFunction = (texts) => embedTexts(texts, env);

    const indexManager = createRagIndexManager({
        // 创建函数， Manger 真正调用它时才开始发起构建
        build: () => {
            return buildRagIndex(
                {
                    knowledgeDir, config
                },
                {
                    embed: embedDocuments
                }
            )
        }
    });

    // 问题向量属于单次查询
    // 该查询传入 signal 继续交给 Provider
    const embedQuery: QueryEmbeddingFunction = (texts, options) => embedTexts(texts, env, options);

    return {
        indexManager,
        embedQuery
    }
};