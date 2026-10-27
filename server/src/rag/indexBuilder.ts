import { AppError, normalizeError } from "../lib/error";
import { loadKnowledgeDocuments } from "./loader";
import { chunkDocument } from "./chunker";
import { embedTextBatches, type EmbeddingFunction } from "./embeddingBatch";
import type { RagDocument, RagIndexConfig, RagIndexItem, RagIndexSnapshot, RagLoadResult } from "./types";
import type { RagLoadDiagnostic } from './types';


/** 本次构建的明确输入， 不依赖 Env */
export type BuildRagIndexInput = {
    knowledgeDir: string;
    config: Readonly<RagIndexConfig>;
};

/** 外部能力 通过注入方便离线测试  */
export type BuildRagIndexDependencies = {
    embed: EmbeddingFunction;
    loadDocuments?: (knowledgeDir: string) => Promise<RagLoadResult>;
    now?: () => Date;
};


export type RagIndexBuildResult = {
    snapshot: RagIndexSnapshot;
    diagnostics: RagLoadDiagnostic[];
};

/**
 * 读取文件或调用 Provider 前检查构建配置
 * 即使知识库空，也不能隐藏非法配置
 */
function validateIndexConfig(config: Readonly<RagIndexConfig>): void {
    if (
        !Number.isSafeInteger(config.chunkSize)
        || config.chunkSize <= 0
        || !Number.isSafeInteger(config.overlap)
        || config.overlap < 0
        || config.overlap >= config.chunkSize
        || !Number.isSafeInteger(config.embeddingBatchSize)
        || config.embeddingBatchSize <= 0
    ) {
        throw new AppError('RAG_INDEX_ERROR', {
            cause: new Error('Index configuration is invalid')
        });
    }
};

/**
 * 从当前知识库完整构建一份新的索引
 *  - 不保存全局状态， 不修改旧索引
 *  - 只有所有步骤都成功才返回快照
 */
export async function buildRagIndex(
    input: BuildRagIndexInput,
    dependencies: BuildRagIndexDependencies
): Promise<RagIndexBuildResult> {
    try {
        const config = { ...input.config };
        validateIndexConfig(config);

        const loadDocuments = dependencies?.loadDocuments ?? loadKnowledgeDocuments;
        const embed = dependencies.embed;
        const now = dependencies?.now ?? (() => new Date());

        /** 1. 加载全部分档 */
        const loader = await loadDocuments(input.knowledgeDir);
        const documentId = new Set<string>();
        const chunks: RagDocument[] = [];
        let documentCount = 0;

        /** 2. 按 Loader 给定的顺序生成 Chunk */
        for (const document of loader.documents) {
            if (documentId.has(document.id)) {
                throw new AppError('RAG_INDEX_ERROR', {
                    cause: 'Duplicate document ID'
                });
            };
            documentId.add(document.id);

            const documentChunks = chunkDocument(document, { chunkSize: config.chunkSize, overlap: config.overlap });
            if (documentChunks.length === 0) continue;

            documentCount += 1;

            for (const chunk of documentChunks) {
                chunks.push(chunk);
            }
        };

        /**
         * 3. 组织文档 Embedding 输入,
         *  - 延续: 标题+来源+chunk正文
         */
        const texts = chunks.map((chunk) => {
            return [
                chunk.title,
                chunk.source,
                chunk.content
            ].join('\n')
        });

        /** 4. 全部批次成功后 才能获得完整饿向量数组 */
        const embeddings = await embedTextBatches(texts, embed, config.embeddingBatchSize);

        /** 5. Builder 检查整体绑定条件 */
        if (embeddings.length !== chunks.length) {
            throw new AppError('RAG_INDEX_ERROR', {
                cause: new Error('Chunk and embedding counts are inconsistent')
            })
        };
        const dimension = embeddings[0]?.length;
        // Provider 只能看到当前批次
        // Builder 能看到所有批次，检查跨批次维度
        for (const embedding of embeddings) {
            if (embedding.length !== dimension) {
                throw new AppError('RAG_INDEX_ERROR', {
                    cause: 'Embedding dimensions differ across batches'
                })
            }
        }

        /**
         * 6. 创建明确的IndexItem 
         *  - 数组下标只在这个构建位置用于一次性绑定, 后续查询直接使用 item.chunk 与 item.embedding
         *  - 复制对象和向量，避免注入实现持有的可变引用,影响快照
        */
        const items: RagIndexItem[] = chunks.map((chunk, index) => {
            return {
                chunk: { ...chunk },
                embedding: [...embeddings[index]]
            }
        });

        /** 7. 所有成功结束后，记录完成时间 */
        const snapshot: RagIndexSnapshot = {
            items,
            documentCount,
            chunkCount: chunks.length,
            builtAt: now().toISOString()
        }

        return {
            snapshot,
            diagnostics: loader.diagnostics.map(diagnostic => ({ ...diagnostic }))
        }
    } catch (error: unknown) {
        throw normalizeError(error, 'RAG_INDEX_ERROR')
    }
};