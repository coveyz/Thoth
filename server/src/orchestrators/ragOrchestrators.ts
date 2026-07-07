import { retrieveSources } from "../rag/retriever";

import type { ProviderMessage } from "../providers/types";
import type { RagSource } from "../rag/types";
import { buildRagAnswerMessage } from "../prompts/system";

type PrepareRagTurnInput = {
    userMessage: string;
}


export type PrepareRagTurnOutput = {
    /** 交给 Provider.stream */
    finalMessages: ProviderMessage[];
    /** 通过 SSE 提前给前端 */
    sources: RagSource[];
}

/** 
 * 最小 RAG 编排
 *  1. 关键词检索
 *  2. 得到sources
 *  3. 组装 RAG prompt
 */
export const prepareRagTurn = (
    input: PrepareRagTurnInput
): PrepareRagTurnOutput => {
    const { sources } = retrieveSources(input.userMessage, 3)

    return {
        sources,
        finalMessages: buildRagAnswerMessage({
            userMessage: input.userMessage,
            sources
        })
    }

}