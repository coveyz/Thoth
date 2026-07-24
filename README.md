# Thoth

## 路线图（4 周）

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

### RAG 后续：生产级知识库系统路线

Week3 已完成最小可用 RAG 闭环。后续如果要从学习项目走向更真实的知识库系统，可以按以下层次推进。

#### 1. 文档接入层

- [ ] 支持 Markdown / TXT 文档导入
- [ ] 支持 PDF / 网页内容解析
- [ ] 支持文档标题、来源、作者、更新时间等 metadata
- [ ] 支持文档新增、更新、删除
- [ ] 支持文档版本记录
- [ ] 支持文档解析失败时的错误记录

#### 2. 索引构建层

- [ ] 文档入库时异步 chunk
- [ ] 文档入库时异步 embedding
- [ ] 支持 embedding batch，避免一次请求过多 texts
- [ ] 支持索引重建
- [ ] 支持增量索引更新
- [ ] 支持索引状态：pending / indexing / ready / failed

#### 3. 向量存储层

- [ ] 从内存缓存升级为持久化向量存储
- [ ] 可选方案：Postgres + pgvector
- [ ] 可选方案：Qdrant / Milvus / Pinecone
- [ ] 保存 chunk text、embedding、metadata、documentId
- [ ] 支持按 userId / workspaceId / documentId 过滤
- [ ] 支持删除文档时同步删除向量

#### 4. 检索质量层

- [ ] 支持 TopK 参数配置
- [ ] 支持 score threshold 配置
- [ ] 支持 hybrid search：关键词 + 向量
- [ ] 支持 metadata filter
- [ ] 支持 query rewrite
- [ ] 支持 multi-query retrieval
- [ ] 支持 reranker 二次排序
- [ ] 支持 source 去重和相邻 chunk 合并

#### 5. Prompt 与防幻觉层

- [ ] 强化 no-hit 回答规范
- [ ] 要求回答必须引用 source id
- [ ] 对 sources 做长度裁剪，避免 prompt 过长
- [ ] 防止文档中的 prompt injection
- [ ] 区分“文档未覆盖”和“模型无法判断”
- [ ] 支持回答置信度或依据说明

#### 6. 前端体验层

- [ ] sources 折叠 / 展开
- [ ] 高亮命中片段
- [ ] 点击 source 跳转原文
- [ ] 回答引用编号和 source 面板联动
- [ ] 展示检索分数和来源 metadata
- [ ] 支持用户反馈：有用 / 无用 / source 错误

#### 7. 权限与安全层

- [ ] 多用户 / 多 workspace 隔离
- [ ] 检索时按权限过滤文档
- [ ] 日志中避免记录敏感原文
- [ ] 支持 PII / secret 脱敏
- [ ] 支持上传文件大小和类型限制
- [ ] 支持恶意文档内容防护

#### 8. 评估与回归层

- [ ] 建立 RAG 回归题库
- [ ] 覆盖命中、低命中、无命中、歧义问题
- [ ] 记录期望 source
- [ ] 记录期望回答要点
- [ ] 评估 retrieval hit rate
- [ ] 评估 answer groundedness
- [ ] 每次改 chunk / embedding / threshold 后跑回归

#### 9. 可观测性与成本层

- [ ] 记录 requestId、latency、provider、model
- [ ] 记录 embedding 请求次数和 token / 字符量
- [ ] 记录 retrieved source ids 和 scores
- [ ] 记录 no-hit 比例
- [ ] 记录 provider 错误类型
- [ ] 支持超时、重试、限流
- [ ] 支持成本粗略统计

### 第 4 周：工程化上线底线（质量/安全/回归）

**本周目标**：把应用变得更可靠：成本意识、权限隔离雏形、安全底线、可回归。

**本周交付/验收**

- [ ] 基础多会话隔离（至少 sessionId 级别；有条件做到 userId）
- [ ] 成本与稳定性：超时/重试策略、token 统计（粗略也行）
- [ ] 基础安全：PII 提示、最小化日志、RAG 防提示注入的基本约束
- [ ] 回归题库：至少 20 条问答用例（手动/脚本都可），跑一次能验证核心功能

**一句话**：本周把它做成“别人能 clone 运行 + 你敢拿去展示”的项目。
