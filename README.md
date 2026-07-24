# Thoth

## 路线图

Thoth 的当前目标是从一个学习型 AI Chat 项目，逐步升级为一个更真实的知识库问答助手：

```text
聊天 MVP
-> 工具调用
-> 最小 RAG 闭环
-> 工程化回归
-> 文档接入
-> 向量持久化
-> 检索质量优化
-> 权限安全与观测
-> 产品展示收口
```

### 已完成

### 第 1 周：聊天 MVP（流式体验优先）

**本周目标**：做出一个“像样的 Thoth Chat”，具备流式输出、停止生成、错误提示、会话基础状态管理。

**本周交付/验收**

- [x] 能发送消息并收到 SSE 流式增量输出
- [x] 支持停止生成（Abort）
- [x] 有最基本的 UI 状态：发送中、停止中、错误态
- [x] 后端是“可替换模型”的代理层（先不追求 RAG）
- [x] 冒烟用例记录见 [WEEK1_CHECKLIST.md](WEEK1_CHECKLIST.md)

**一句话**：本周把“聊天产品体验”做出来。

### 第 2 周：可控输出 + 工具调用（让它开始“能干活”）

**本周目标**：让模型输出更可控，并引入 Tool Calling（模型→参数→代码执行→回灌→最终回答）。

**本周交付/验收**

- [x] Prompt 工程化：system prompt + 结构化输出（建议 JSON）
- [x] 至少 1 个工具（例如：extract_todos / summarize / make_plan）
- [x] 工具调用链路跑通：模型决定调用 → 你的代码执行 → 再生成最终回复
- [x] 失败兜底：工具报错时能回退成普通回答或提示
- [x] 冒烟用例记录见 [WEEK2_CHECKLIST.md](WEEK2_CHECKLIST.md)

**一句话**：本周让 Thoth 从“会聊天”升级为“会办事”。

### 第 3 周：RAG（文档问答 + 引用 sources）

**本周目标**：接入知识库，做到“基于文档回答且可追溯”。

**本周交付/验收**

- [x] 文档切分（chunk + overlap）+ embedding
- [x] 相似度检索 TopK + 拼 prompt
- [x] 返回并展示 sources（引用片段/来源）
- [x] 无命中/低相似度时：明确拒答或提示“文档未覆盖”（降幻觉）
- [x] 冒烟用例记录见 [WEEK3_CHECKLIST.md](WEEK3_CHECKLIST.md)

**一句话**：本周让 Thoth “通晓你的资料”。

### 后续计划：从最小 RAG 到生产级知识库系统

Week3 已完成最小可用 RAG 闭环。后续不再把“工程化”和“RAG 后续”分成两条线，而是按 Week4 - Week9 逐步推进。

### 第 4 周：回归体系 + 工程化底座

**本周目标**：让 Week1 - Week3 的能力不只是“能跑”，而是可以稳定验证、可以定位问题。

**阶段拆分**

- [ ] 阶段 1：整理普通聊天、工具调用、RAG 命中、RAG no-hit、停止、超时等验收用例
- [ ] 阶段 2：建立最小回归题库，覆盖 Week1 - Week3 主链路
- [ ] 阶段 3：统一错误码和错误展示
- [ ] 阶段 4：记录 requestId、latency、provider、model
- [ ] 阶段 5：整理 env 配置和启动说明
- [ ] 阶段 6：补一份 Week4 checklist

**完成标准**

- [ ] 普通聊天可以回归
- [ ] 工具调用可以回归
- [ ] RAG 命中可以回归
- [ ] RAG no-hit 可以回归
- [ ] 停止和超时路径可以验证
- [ ] 出错时能通过 requestId 和日志定位

**一句话**：本周先把 Thoth 变得可验证。

### 第 5 周：文档接入 + 索引构建

**本周目标**：不再把知识库写死在 `document.ts`，开始支持真实文档接入和索引构建。

**阶段拆分**

- [ ] 阶段 1：设计文档 metadata：id、title、source、path、updatedAt
- [ ] 阶段 2：支持读取本地 Markdown / TXT 文档
- [ ] 阶段 3：把 `rawRagDocuments` 从代码写死改成从文件加载
- [ ] 阶段 4：文档 chunk 后生成可检索 index
- [ ] 阶段 5：embedding 支持 batch，避免一次请求过多 texts
- [ ] 阶段 6：支持索引状态：pending / indexing / ready / failed
- [ ] 阶段 7：支持索引重建

**完成标准**

- [ ] 新增一个 Markdown / TXT 文件后，RAG 能检索到
- [ ] 修改文档后，可以重建索引
- [ ] 删除文档后，不再命中旧内容
- [ ] sources 能展示文档 metadata

**一句话**：本周让知识可以从文件进入 Thoth。

### 第 6 周：向量存储 + 持久化检索

**本周目标**：从内存缓存升级到真实向量存储，让文档向量可以持久化。

**阶段拆分**

- [ ] 阶段 1：选择向量存储方案，优先考虑 Postgres + pgvector
- [ ] 阶段 2：设计 `documents` 表
- [ ] 阶段 3：设计 `chunks` 表
- [ ] 阶段 4：保存 chunk text、embedding、metadata、documentId
- [ ] 阶段 5：查询时只 embedding 用户问题
- [ ] 阶段 6：用数据库完成 TopK 检索
- [ ] 阶段 7：支持删除文档时同步删除向量
- [ ] 阶段 8：支持重建索引

**完成标准**

- [ ] server 重启后，不需要重新 embedding 全部文档
- [ ] TopK sources 从数据库返回
- [ ] 文档更新后能重建对应 chunks 和 embeddings
- [ ] 检索仍然返回可追溯 sources

**一句话**：本周让知识库从内存 demo 走向持久化系统。

### 第 7 周：检索质量优化 + RAG Eval

**本周目标**：让 RAG 不只是能搜，而是能评估、能调优、知道错在哪里。

**阶段拆分**

- [ ] 阶段 1：建立 RAG eval 题库
- [ ] 阶段 2：每题记录 expected sources
- [ ] 阶段 3：每题记录 expected answer points
- [ ] 阶段 4：评估 retrieval hit rate
- [ ] 阶段 5：评估 answer groundedness
- [ ] 阶段 6：调 chunkSize / overlap / MIN_RAG_SCORE
- [ ] 阶段 7：尝试 hybrid search：关键词 + 向量
- [ ] 阶段 8：可选增加 reranker 二次排序
- [ ] 阶段 9：支持 source 去重和相邻 chunk 合并

**完成标准**

- [ ] 每次改检索逻辑后，可以看到命中率变化
- [ ] 能区分 retrieval 错还是 generation 错
- [ ] no-hit 和低命中场景有稳定判断
- [ ] sources 排序质量可被回归题库验证

**一句话**：本周让 Thoth 的 RAG 质量可衡量。

### 第 8 周：权限安全 + 成本观测

**本周目标**：补真实系统边界：谁能搜什么、花了多少钱、哪里出错了。

**阶段拆分**

- [ ] 阶段 1：引入 userId / workspaceId
- [ ] 阶段 2：文档按 workspace 隔离
- [ ] 阶段 3：检索时按权限过滤文档
- [ ] 阶段 4：日志最小化，避免记录敏感原文
- [ ] 阶段 5：支持 PII / secret 脱敏策略
- [ ] 阶段 6：增加 RAG prompt injection 防护
- [ ] 阶段 7：记录 embedding / chat 调用次数
- [ ] 阶段 8：记录 latency、error、no-hit 比例
- [ ] 阶段 9：支持基础限流和重试策略

**完成标准**

- [ ] A 用户不能检索 B 用户文档
- [ ] 敏感内容不被随意打进日志
- [ ] provider 错误可定位
- [ ] embedding 和 chat 调用量可粗略统计
- [ ] 常见超时、限流、上游失败有稳定提示

**一句话**：本周让 Thoth 接近真实业务系统的安全和观测边界。

### 第 9 周：产品体验 + 项目展示收口

**本周目标**：把项目打磨成可以演示、可以交给别人 clone 运行的知识库助手。

**阶段拆分**

- [ ] 阶段 1：文档管理页面
- [ ] 阶段 2：索引状态展示
- [ ] 阶段 3：sources 折叠 / 展开
- [ ] 阶段 4：source 点击跳转原文
- [ ] 阶段 5：命中片段高亮
- [ ] 阶段 6：回答引用编号和 source 面板联动
- [ ] 阶段 7：用户反馈：有用 / 无用 / source 错误
- [ ] 阶段 8：README 完整化
- [ ] 阶段 9：演示脚本和最终回归

**完成标准**

- [ ] 别人 clone 项目后知道怎么启动
- [ ] 知道怎么导入文档
- [ ] 知道怎么测试 RAG
- [ ] 能看到索引状态和 sources
- [ ] 能完整演示一条知识库问答链路

**一句话**：本周把 Thoth 做成一个能展示的 AI 知识库项目。
