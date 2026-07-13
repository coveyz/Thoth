import { retrieveSources } from "../rag/retriever";
import { buildRagAnswerMessage } from "../prompts/system";
import type { ProviderMessage } from "../providers/types";
import type { RagSource } from "../rag/types";
import type { Env } from "../lib/env";

type PrepareRagTurnInput = {
    userMessage: string;
    env: Env;
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
export const prepareRagTurn = async (
    input: PrepareRagTurnInput
): Promise<PrepareRagTurnOutput> => {
    const { sources } = await retrieveSources(input.userMessage, input.env, 3);

    return {
        sources,
        finalMessages: buildRagAnswerMessage({
            userMessage: input.userMessage,
            sources
        })
    }

}