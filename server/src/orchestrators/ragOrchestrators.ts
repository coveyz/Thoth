import { retrieveSourcesFromSnapshot } from "../rag/retriever";
import { buildRagAnswerMessage } from "../prompts/system";
import type { ProviderMessage } from "../providers/types";
import type { RagSource } from "../rag/types";
import type { Env } from "../lib/env";
import type { RagRuntime } from "../rag/runtime";

type PrepareRagTurnInput = {
    userMessage: string;
    // env: Env;
    rag: RagRuntime;
    signal: AbortSignal;
}


export type PrepareRagTurnOutput = {
    /** 交给 Provider.stream */
    finalMessages: ProviderMessage[];
    /** 通过 SSE 提前给前端 */
    sources: RagSource[];
};

/** 
 * 一次 RAG 问答的编排
 */
export const prepareRagTurn = async (
    input: PrepareRagTurnInput
): Promise<PrepareRagTurnOutput> => {
    const { userMessage, rag, signal } = input;

    signal?.throwIfAborted();

    // 共享构建 不绑定当前 signal
    //! 本阶段 等待构建结束， 下阶段取消本请求等待
    const snapshot = await rag.indexManager.ensureReady();

    signal?.throwIfAborted();

    const { sources } = await retrieveSourcesFromSnapshot(
        {
            query: userMessage,
            snapshot,
            signal
        },
        rag.embedQuery
    );

    return {
        sources,
        finalMessages: buildRagAnswerMessage({
            userMessage,
            sources
        })
    }
}