# Week3 Checklist: RAG 文档问答 + 引用 Sources

## 本周目标

让 Thoth 接入一个最小可用知识库，支持基于文档回答问题，并把回答依据以 `sources` 的形式返回和展示。

一句话总结：

> Week3 让 Thoth 从“会聊天 / 会调用工具”升级为“能基于你的资料回答，并能追溯依据”。

## 完成状态

- [x] Server 支持 `rag: true` 分支
- [x] Server 能在 RAG 模式下返回 `event: sources`
- [x] 文档支持原始文档层和 chunk 层分离
- [x] 支持 chunk + overlap
- [x] 支持 embedding provider 配置
- [x] 支持 OpenAI-compatible embedding 接口
- [x] 已使用阿里 DashScope `text-embedding-v4` 跑通 embedding
- [x] 支持 query embedding
- [x] 支持 document embedding
- [x] 支持 document embeddings 内存缓存
- [x] 支持 cosine similarity 相似度计算
- [x] 支持 TopK sources 返回
- [x] 支持低相似度过滤 `MIN_RAG_SCORE`
- [x] 支持 no-hit 时提示文档未覆盖
- [x] 支持 RAG prompt 拼装
- [x] 支持回答中引用 `[source 1]` 形式的依据
- [x] 前端支持 RAG 开关
- [x] 前端请求体支持 `rag: true`
- [x] 前端 SSE parser 支持 `event: sources`
- [x] 前端 store 保存当前 turn 的 sources
- [x] 前端展示 sources 面板
- [x] 普通聊天 / Week2 工具调用链路不被 RAG 改动破坏

## 本周新增 / 修改的关键文件

### Server

- `server/src/rag/types.ts`
  - 定义 `RagRawDocument`
  - 定义 `RagDocument`
  - 定义 `RagSource`
  - 定义 `RagSearchResult`

- `server/src/rag/document.ts`
  - 保存原始 RAG 文档
  - 通过 `chunkText` 自动生成 `ragDocuments`
  - 保留 `documentId`、`chunkIndex`、`source` 等 metadata

- `server/src/rag/chunker.ts`
  - 实现字符级 chunk
  - 支持 `chunkSize`
  - 支持 `overlap`
  - 处理空内容和非法参数

- `server/src/rag/embedding.ts`
  - 使用 OpenAI-compatible SDK 调用 embedding API
  - 支持通过环境变量切换 embedding provider
  - 当前可配置到阿里 DashScope

- `server/src/rag/similarity.ts`
  - 实现 cosine similarity
  - 用于 query embedding 和 document embedding 的相似度计算

- `server/src/rag/retriever.ts`
  - 生成 query embedding
  - 缓存 document embeddings
  - 计算 similarity score
  - 排序并返回 TopK
  - 通过 `MIN_RAG_SCORE` 过滤低相关结果

- `server/src/orchestrators/ragOrchestrators.ts`
  - 编排 RAG 流程
  - 调用 `retrieveSources`
  - 调用 `buildRagAnswerMessage`
  - 返回 `sources` 和 `finalMessages`

- `server/src/prompts/system.ts`
  - 新增 RAG answer prompt
  - 要求优先基于 sources 回答
  - 要求无覆盖时明确说明文档未覆盖
  - 要求回答中标注 `[source n]`

- `server/src/routes/chat.ts`
  - 根据 `req.body.rag === true` 进入 RAG 分支
  - SSE 顺序支持 `start -> sources -> delta -> done`
  - 保留停止、超时、错误兜底

- `server/src/lib/env.ts`
  - 新增 embedding 相关环境变量

- `server/src/lib/sse.ts`
  - SSE 协议新增 `sources`

### Web

- `web/src/types/chat.ts`
  - 新增 `RagSource`
  - 新增 `SSERagSource`
  - `ChatTurnTrace` 新增 `rag` 和 `sources`
  - SSE event name 新增 `sources`

- `web/src/api/apiStream.ts`
  - 请求体支持 `rag`
  - SSE parser 支持 `event: sources`
  - 新增 `onSources` callback

- `web/src/stores/chat.ts`
  - 新增 `ragEnabled`
  - 新增 `setRagEnabled`
  - 当前 turn 保存 sources
  - 收到 `onSources` 后更新当前 turn

- `web/src/components/Chat/Composer.vue`
  - 新增 RAG checkbox
  - 通过 `update:ragEnabled` 更新 store

- `web/src/components/Chat/SourcesPanel.vue`
  - 新增 sources 展示面板
  - 展示 title、source、chunk、score、content

- `web/src/components/Chat/ChatView.vue`
  - 挂载 `SourcesPanel`
  - 连接 RAG 开关状态

## 核心生命周期

```text
用户勾选 RAG
-> Composer emit update:ragEnabled
-> ChatView 调用 chat.setRagEnabled
-> store.ragEnabled = true
-> 用户发送问题
-> store.send
-> pushUser
-> createTurn
-> ensureAssistant
-> streamChat 发起 SSE 请求，body 带 rag: true
-> server chat.ts 初始化 SSE
-> 发送 event: start
-> useRag === true，进入 prepareRagTurn
-> retrieveSources
-> embedTexts 生成 query embedding
-> getDocumentEmbeddings 获取或生成 document embeddings
-> cosineSimilarity 计算相似度
-> 按 score 排序
-> MIN_RAG_SCORE 过滤低相关结果
-> TopK sources
-> buildRagAnswerMessage 拼 RAG prompt
-> server 发送 event: sources
-> provider.stream 生成回答
-> server 持续发送 event: delta
-> 前端 appendAssistantDelta
-> MessageList 更新回答正文
-> SourcesPanel 展示 sources
-> server 发送 event: done
```

## 关键概念

- RAG 是 `Retrieval + Generation`
- Chunking 是知识库切分
- Overlap 用于减少 chunk 边界导致的上下文丢失
- Embedding 用于把文本转成向量
- Cosine similarity 用于计算语义相似度
- TopK 用于选出最相关的文档片段
- Sources 用于可追溯回答依据
- `MIN_RAG_SCORE` 用于过滤低相关结果
- Prompt no-hit 规则用于降低幻觉
- SSE 用于流式返回 sources 和 answer delta

## 验收用例

### 1. RAG 命中问题

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"Thoth 第三周为什么要返回引用来源？","rag":true}'
```

期望：

- [x] 返回 `event: start`
- [x] 返回 `event: sources`
- [x] `sources` 包含 Week3 / RAG / sources 相关 chunk
- [x] `score` 是向量相似度小数
- [x] 后续返回 `event: delta`
- [x] 最后返回 `event: done`

### 2. RAG 低命中问题

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"今天上海天气怎么样？","rag":true}'
```

期望：

- [x] 低相关 sources 被过滤
- [x] 模型不要编造文档中没有的答案
- [x] 回答应明确说明当前文档未覆盖这个问题

### 3. 前端 RAG 展示

- [x] 勾选 RAG 后，请求体带 `rag: true`
- [x] 页面展示 sources 面板
- [x] sources 和 assistant 正文分开展示
- [x] assistant 仍然正常流式输出

### 4. 普通聊天回归

- [x] 不勾选 RAG 时，继续走普通聊天 / 工具调用链路
- [x] 不展示 sources 面板
- [x] `tool_call` / `tool_result` / `tool_error` 仍能被解析和展示

## 已知简化

- 文档写死在 `document.ts`
- chunker 是字符级切分
- document embeddings 缓存在内存里
- 没有向量数据库
- 没有文档上传、解析、删除、重建索引
- 没有权限隔离
- 没有 RAG eval 测试集
- `MIN_RAG_SCORE` 是经验阈值
- sources 展示还是最小版

## Week3 结论

Week3 已完成一个最小可用 RAG 闭环：

```text
chunk -> embedding -> similarity TopK -> sources -> RAG prompt -> streaming answer -> frontend sources display
```

后续重点不再是“能不能跑通 RAG”，而是把它升级成更真实的知识库系统。

