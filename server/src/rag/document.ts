
import type { RagDocument } from './types';


/** fake document chunk */
export const ragDocuments: RagDocument[] = [
    {
        id: 'thoth-week1-chat-mvp',
        title: 'Thoth Week1 Chat MVP',
        source: 'README.md#week1',
        content: [
            'Thoth 第 1 周目标是做出聊天 MVP。',
            '核心能力包括 SSE 流式输出、停止生成 Abort、错误提示、会话基础状态管理。',
            '后端在 Week1 阶段是一个可替换模型的代理层，暂时不追求 RAG。',
        ].join('\n')
    },
    {
        id: 'thoth-week2-tool-calling',
        title: 'Thoth Week2 工具调用',
        source: 'README.md#week2',
        content: [
            'Thoth 第 2 周目标是可控输出和工具调用。',
            '工具调用链路是：模型决定调用工具，后端执行真实工具，再把工具结果回灌给模型生成最终回答。',
            '当前已有 extract_todos、summarize、make_plan 三个本地工具。',
            '工具失败时需要返回 tool_error，并进入保守 fallback 回答。',
        ].join('\n'),
    },
    {
        id: 'thoth-week3-rag',
        title: 'Thoth Week3 RAG',
        source: 'README.md#week3',
        content: [
            'Thoth 第 3 周目标是 RAG，也就是文档问答和引用 sources。',
            '本周要完成文档切分 chunk + overlap、embedding、相似度检索 TopK、拼 prompt。',
            '回答时需要返回并展示 sources。',
            '当文档无命中或低相似度时，应该明确提示文档未覆盖，降低幻觉。',
        ].join('\n'),
    },
    {
        id: 'thoth-week4-engineering',
        title: 'Thoth Week4 工程化',
        source: 'README.md#week4',
        content: [
            'Thoth 第 4 周目标是工程化上线底线。',
            '重点包括基础多会话隔离、超时和重试策略、token 统计、PII 提示、最小化日志。',
            '还需要建立至少 20 条问答回归用例。',
        ].join('\n'),
    },
]