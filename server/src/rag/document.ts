import { chunkText } from './chunker'
import type { RagDocument, RagRawDocument } from './types';


/**
 * 阶段2: 保存原始文档，不在手写chunk
 * 
 */
export const rawRagDocuments: RagRawDocument[] = [
    {
        id: 'thoth-roadmap',
        title: 'Thoth 四周路线图',
        source: 'README.md#roadmap',
        content: [
            '第 1 周：聊天 MVP。目标是做出一个像样的 Thoth Chat，具备流式输出、停止生成、错误提示、会话基础状态管理。',
            '第 2 周：可控输出 + 工具调用。目标是让模型输出更可控，并引入 Tool Calling。',
            '工具调用链路是：模型决定调用工具，后端执行真实工具，再把工具结果回灌给模型生成最终回答。',
            '当前已有 extract_todos、summarize、make_plan 三个本地工具。',
            '第 3 周：RAG，文档问答 + 引用 sources。目标是接入知识库，做到基于文档回答且可追溯。',
            'Week3 需要完成文档切分 chunk + overlap、embedding、相似度检索 TopK、拼 prompt。',
            '回答时需要返回并展示 sources。',
            '当文档无命中或低相似度时，应该明确提示文档未覆盖，降低幻觉。',
            '第 4 周：工程化上线底线。重点包括多会话隔离、超时重试、token 统计、安全底线和回归题库。',
        ].join('\n\n'),
    },
    {
        id: 'thoth-week2-checklist',
        title: 'Thoth Week2 验收说明',
        source: 'WEEK2_CHECKLIST.md',
        content: [
            'Week2 的重点是模型决策、工具执行、结果回灌、最终回答。',
            'SSE 新增事件包括 tool_call、tool_result、tool_error。',
            '工具策略支持禁用工具、自动决策、强制指定工具。',
            '前端需要展示每轮工具轨迹，包括工具策略、requestId、model、tool call、tool result 和 tool error。',
            'Fake Provider 用来在没有真实 API Key 时稳定复现工具调用链路。',
            'DeepSeek Provider 用来验证真实模型可以按 JSON 决策工具并流式输出最终回答。',
        ].join('\n\n'),
    }
];

/**
 * 阶段2： 从原始文档自动生成可检索 chunks
 *  - retriever 使用的入口
 */
export const ragDocuments: RagDocument[] = rawRagDocuments.flatMap(doc => {
    const chunks = chunkText(doc.content, {
        chunkSize: 180,
        overlap: 40,
    });

    return chunks.map((content, index) => {
        return {
            id: `${doc.id}-chunk-${index + 1}`,
            documentId: doc.id,
            title: doc.title,
            source: doc.source,
            chunkIndex: index,
            content,
        }
    });
});