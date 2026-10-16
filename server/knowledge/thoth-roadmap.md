# Thoth 学习路线图

Thoth 是一个学习型 AI Chat 与知识库问答项目。

## Week1：流式聊天

Week1 实现 SSE 流式聊天、停止生成和基础错误提示。

## Week2：工具调用

Week2 实现模型决策、工具执行、结果回灌和最终回答。

当前工具包括 extract_todos、summarize 和 make_plan。

## Week3：最小 RAG

Week3 实现文档切分、Embedding、余弦相似度检索和 TopK。

回答返回 sources，是为了让用户能够追溯回答依据。

文档没有覆盖问题时，应明确说明当前文档未覆盖这个问题。

## Week4：工程化回归

Week4 建立自动化回归、统一错误码、requestId 和结构化日志。

## Week5：本地文档与内存索引

Week5 从本地 Markdown 和 TXT 接入知识。

索引构建与查询分离，查询时只生成用户问题的 Embedding。

文件变化后完整重建索引，成功后一次性替换快照。

重建失败时保留上一份成功快照。