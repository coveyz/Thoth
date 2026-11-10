import { retrieveSourcesFromSnapshot } from "../rag/retriever";
import { buildRagAnswerMessage } from "../prompts/system";
import { waitForPromise } from "../lib/waitForPromise";
import type { ProviderMessage } from "../providers/types";
import type { RagSource } from "../rag/types";
import type { RagRuntime } from "../rag/runtime";

type PrepareRagTurnInput = {
    userMessage: string;
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
    const snapshot = await waitForPromise(
        rag.indexManager.ensureReady(),
        signal
    );

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