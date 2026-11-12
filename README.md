# Thoth

Thoth 是一个学习型 AI Chat 与知识库问答项目，目前支持：

- SSE 流式聊天
- 停止生成
- Fake / DeepSeek OpenAI-compatible Chat Provider
- 本地工具调用
- 本地 Markdown/TXT 接入、批量 Embedding 与内存索引检索
- 并发索引构建复用、状态查询与原子重建
- Sources 引用展示
- 统一错误码和前端错误提示
- requestId 与结构化请求日志
- 自动化回归测试

## 本地开发

### 1. 环境要求

- Node.js `^20.19.0` 或 `>=22.12.0`
- pnpm
- 两个终端窗口：分别运行 Server 和 Web

检查版本：

```bash
node --version
pnpm --version
```

项目根目录目前不是 pnpm workspace，也没有根 `package.json`。

因此不要在根目录直接运行：

```bash
pnpm install
pnpm test
pnpm dev
```

请通过 `-C` 指定子项目，或者进入对应目录后执行命令。

---

### 2. 安装依赖

在项目根目录执行：

```bash
pnpm -C server install
pnpm -C web install
```

也可以分别进入目录：

```bash
cd server
pnpm install
```

```bash
cd web
pnpm install
```

---

### 3. 创建 Server 配置

从示例文件复制本地配置：

```bash
cp server/.env.example server/.env
```

`server/.env` 包含本地密钥，已经被 `.gitignore` 忽略。

不要把真实 API Key 写入：

```text
server/.env.example
```

#### Fake Chat 模式

默认 `.env.example` 中：

```env
THOTH_API_KEY=
```

Chat API Key 为空时，Server 自动使用 Fake Provider：

- 不请求真实 Chat API
- 不产生 Chat API 费用
- 输出稳定
- 适合本地开发和回归测试

#### 真实 Chat 模式

在 `server/.env` 中配置：

```env
THOTH_BASE_URL=https://api.deepseek.com
THOTH_API_KEY=你的真实密钥
THOTH_MODEL=deepseek-chat
```

保存后需要重启 Server。

#### RAG Embedding 配置

RAG 使用独立的 OpenAI-compatible Embedding Provider：

```env
THOTH_EMBEDDING_BASE_URL=https://api.openai.com/v1
THOTH_EMBEDDING_API_KEY=你的真实密钥
THOTH_EMBEDDING_MODEL=text-embedding-3-small
THOTH_EMBEDDING_BATCH_SIZE=32
```

也可以配置支持该协议的其他 Embedding 服务。Chat Key 与 Embedding Key
是两套独立配置；Fake Chat 不包含运行时 Fake Embedding。

Embedding Key 为空时，普通聊天和工具调用仍可使用；RAG 需要生成向量时
返回 `EMBEDDING_ERROR`。合法空知识库无需生成向量，可以返回空 Sources；
目录或文档加载失败则可能先返回 `DOCUMENT_LOAD_ERROR`。

`THOTH_EMBEDDING_BATCH_SIZE` 控制文档索引构建时每批发送的文本数量。

- 默认 `32`
- 必须为正安全整数
- 未配置或为空白时使用默认值
- 非法配置会阻止服务启动

Embedding 单次请求超时为 30 秒，关闭 SDK 自动重试。
这是单次外部请求的限制，不是整个索引构建的总时限。

#### 本地知识库

```env
THOTH_KNOWLEDGE_DIR=./knowledge
```

相对目录以 `server` 目录为基准，也支持配置绝对目录。
默认示例文档位于：

```text
server/knowledge/
├── thoth-roadmap.md
└── week2-tools.txt
```

支持递归读取 UTF-8 Markdown（`.md`）和 TXT（`.txt`）。
隐藏文件、隐藏目录、不支持的扩展名和软链接会被忽略。

文档按相对路径确定性排序。空白文件会跳过并记录诊断；
符合读取条件的文档加载失败时，整次索引构建失败。

文档 ID 根据规范化相对路径稳定生成。Markdown 优先使用一级标题，
没有一级标题时回退到文件名；TXT 使用文件名。`updatedAt` 来自原始文件
修改时间，快照的 `builtAt` 表示本次索引构建完成时间。

#### 索引与查询生命周期

每个 App 创建一份独立的 RAG Runtime。创建 Runtime 不读取文件，
首次需要索引的 RAG 请求才触发构建：

```text
本地文件
→ Loader
→ Chunker
→ Batch Embedding
→ 完整索引快照
```

并发请求复用同一次构建。后续查询复用文档向量，
只为当前问题生成 Query Embedding。

索引项把 Chunk 与对应向量保存在同一个 `IndexItem` 中。
每次查询使用一份完整快照，避免异步等待期间混用新旧索引。

关闭 RAG 时，不读取知识库、不构建索引、不调用 Embedding。

当前切分参数为 chunkSize 180、overlap 40；
检索参数为 topK 3、minScore 0.55，定义在
`server/src/rag/config.ts`，暂不增加对应环境变量。

#### 文件变化与完整重建

文件变化不会自动刷新已有快照。
服务内需要显式调用同一个 Runtime 的 `indexManager.rebuild()`：

```text
保留旧快照
→ 读取当前全部文件
→ 构建完整新快照
→ 成功后一次性替换
```

重建能反映文档新增、修改和删除。

- 首次构建失败：没有可用快照，后续请求可以重试。
- 已有快照时重建失败：记录失败，保留旧快照。
- 成功构建空快照：替换旧快照，后续查询返回空 Sources。

Manager 在服务端内部提供 `getState()` 和 `getDiagnostics()`。
状态为 `pending`、`indexing`、`ready` 或 `failed`；当前可用快照与最近
失败摘要单独保存，因此 `failed` 不代表旧快照一定不可查询。
已有快照时，`ensureReady()` 直接返回它，不等待正在进行的重建。

当前没有公开的重建接口，也不自动监听文件变化。
手工演示文件更新时，可以修改文件、重启 Server，
再发起 RAG 请求。这会构建新的内存索引。

索引仅保存在当前进程内，Server 重启后需要重新构建。

#### 取消、超时与安全错误

用户停止、连接关闭或当前请求整体超时时，
结束当前请求的等待和后续查询、回答流程。
已启动的共享索引构建继续执行，供其他请求使用。

问题 Embedding 接收当前请求的 AbortSignal；
共享文档构建不绑定某个聊天请求的 signal。

Sources 包含文档 metadata、片段正文和本次检索分数，
不公开机器绝对路径或 Embedding 向量。

公开字段为 `id`、`documentId`、`title`、`source`、`path`、
`updatedAt`、`chunkIndex`、`content` 和 `score`。
`score` 属于本次问题的检索结果，不是 Chunk 的固定属性。

文件加载失败使用 `DOCUMENT_LOAD_ERROR`，
索引或查询维度不一致等问题使用 `RAG_INDEX_ERROR`，
Embedding 服务失败使用 `EMBEDDING_ERROR`。

对外错误仅包含安全的 code、message 和 requestId，
不包含原始 cause 或 stack。

---

### 4. 启动 Server

终端一：

```bash
pnpm -C server dev
```

预期：

```text
[server] listening on http://localhost:3001
```

健康检查：

```bash
curl http://localhost:3001/healthz
```

预期：

```json
{"ok":true,"version":"0.1.0"}
```

每个请求结束时，Server 会输出一行结构化 JSON 日志，例如：

```json
{
  "level": "info",
  "event": "request.completed",
  "requestId": "abcd",
  "method": "GET",
  "path": "/healthz",
  "statusCode": 200,
  "latencyMs": 2,
  "outcome": "success"
}
```

Chat 请求还会记录：

- provider
- model
- rag
- toolName
- outcome
- errorCode

---

### 5. 启动 Web

终端二：

```bash
pnpm -C web dev
```

预期：

```text
Local: http://localhost:5173/
```

打开：

```text
http://localhost:5173
```

开发环境中，Vite 会把：

```text
/api/*
```

代理到：

```text
http://localhost:3001
```

---

### 6. 运行自动测试

Server 完整回归：

```bash
pnpm -C server test
```

当前回归覆盖：

- Health
- 普通流式聊天
- 工具调用
- RAG hit
- RAG no-hit
- RAG disabled
- 非法请求
- Provider 错误
- Embedding 错误
- 未知内部错误
- 首 Token 超时
- 整体超时
- 结构化请求日志
- 本地 Loader、metadata 传播与 Chunk 切分
- 批量 Embedding、响应 index 和向量维度校验
- 索引状态、并发构建复用、失败重试与原子重建
- 文件新增、修改、删除后的检索与最新 Sources
- Query Embedding 取消、共享构建等待取消与超时
- 客户端断开后的请求退出与索引复用
- 文档和索引错误的安全 SSE 输出

Server TypeScript 检查：

```bash
pnpm -C server exec tsc --noEmit
```

Web 类型检查：

```bash
pnpm -C web run type-check
```

Web 生产构建：

```bash
pnpm -C web run build
```

自动测试使用内置或测试专用 Fake Chat Provider，以及注入的确定性
Embedding／SDK Mock，不需要真实 API Key，也不访问外部模型服务。
文件系统测试使用独立临时目录，不读取开发者的真实知识库。

Week5 验收基线为 **18 个测试文件、205 个测试**。
`web build` 已包含 Web 类型检查，无需为了构建再单独重复执行一次。
完整验收与手工演示记录见 [WEEK5_CHECKLIST.md](WEEK5_CHECKLIST.md)。

---

### 7. 最小 API 冒烟

#### 普通聊天

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"你好","toolChoice":"none","rag":false}'
```

预期事件顺序：

```text
start
→ delta
→ done
```

#### 工具调用

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"请提取待办：更新 README","toolChoice":"auto","rag":false}'
```

预期事件顺序：

```text
start
→ tool_call
→ tool_result
→ delta
→ done
```

#### RAG

RAG 需要配置有效的 Embedding Provider：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"Thoth Week5 如何处理索引重建失败？","toolChoice":"none","rag":true}'
```

预期事件顺序：

```text
start
→ sources
→ delta
→ done
```

该问题的依据位于 `server/knowledge/thoth-roadmap.md`。
检查 Sources 是否包含“重建失败时保留上一份成功快照”。
真实命中受 Embedding 模型和检索阈值影响；Fake Chat 模式可验证协议，
但评估真实回答质量需要配置真实 Chat Provider。

---

### 8. 常见问题

#### `ERR_PNPM_NO_SCRIPT Missing script: test`

原因：在项目根目录运行了：

```bash
pnpm test
```

解决：

```bash
pnpm -C server test
```

#### `Couldn't connect to localhost port 3001`

优先检查：

1. Server 是否已经启动
2. `server/.env` 中的 `PORT`
3. 3001 端口是否被其他程序占用

#### 页面打开但 API 请求失败

检查：

1. Web 是否运行在 `http://localhost:5173`
2. Server 是否运行在 `http://localhost:3001`
3. `CORS_ORIGIN` 是否为 `http://localhost:5173`
4. `web/vite.config.ts` 的 proxy target 是否为 `http://localhost:3001`

#### 页面显示 `fake-model`

这是正常的 Fake Chat 模式。

如果希望使用真实模型，请在 `server/.env` 中配置 `THOTH_API_KEY` 并重启 Server。

#### 开启 RAG 后显示 `EMBEDDING_ERROR`

检查：

```env
THOTH_EMBEDDING_BASE_URL
THOTH_EMBEDDING_API_KEY
THOTH_EMBEDDING_MODEL
```

普通 Chat Key 和 Embedding Key 是两套独立配置。

#### 开启 RAG 后显示 `DOCUMENT_LOAD_ERROR`

检查 `THOTH_KNOWLEDGE_DIR` 是否存在、是否可读，以及目录内文档是否为
合法 UTF-8。相对路径以 `server` 为基准，不随启动命令的当前目录改变。

#### 修改知识库后仍然返回旧内容

已有快照不会自动刷新。服务内显式调用同一 Runtime 的
`indexManager.rebuild()`，或在手工演示中重启 Server 后重新提问。
当前没有用于重建的 HTTP 接口。

#### 修改 `.env` 后没有生效

环境变量只在进程启动时读取。

修改后停止并重新运行：

```bash
pnpm -C server dev
```

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

- [x] 阶段 1：整理普通聊天、工具调用、RAG 命中、RAG no-hit、停止、超时等验收用例
- [x] 阶段 2：建立最小回归题库，覆盖 Week1 - Week3 主链路
- [x] 阶段 3：统一错误码和错误展示
- [x] 阶段 4：记录 requestId、latency、provider、model
- [x] 阶段 5：整理 env 配置和启动说明
- [x] 阶段 6：补一份 Week4 checklist

**完成标准**

- [x] 普通聊天可以回归
- [x] 工具调用可以回归
- [x] RAG 命中可以回归
- [x] RAG no-hit 可以回归
- [x] 停止和超时路径可以验证
- [x] 出错时能通过 requestId 和日志定位

**一句话**：本周先把 Thoth 变得可验证。

### 第 5 周：文档接入 + 索引构建

**本周目标**：从本地 Markdown/TXT 接入知识，构建可复用、可查询、可重建的内存索引。

**阶段拆分**

- [x] 阶段 1：设计文档 metadata：id、title、source、path、updatedAt
- [x] 阶段 2：支持安全、确定性地读取本地 Markdown / TXT 文档
- [x] 阶段 3：删除写死文档与旧缓存，将聊天接入本地索引
- [x] 阶段 4：文档 chunk 后生成绑定向量的 IndexItem 与完整快照
- [x] 阶段 5：Embedding 支持串行 batch 与结果校验
- [x] 阶段 6：支持索引状态、失败诊断与并发构建复用
- [x] 阶段 7：支持原子重建、失败保留旧快照与请求取消

**完成标准**

- [x] 新增文档后，完整重建能够检索到新内容（自动测试）
- [x] 修改文档后，重建与检索返回最新内容及 metadata（自动测试）
- [x] 删除文档后，重建不再返回旧文档（自动测试）
- [x] Sources 展示文档标题、相对来源、片段与检索分数（页面演示）
- [x] Server 回归、类型检查与 Web 生产构建通过

详细证据和其余手工演示待确认项见 [WEEK5_CHECKLIST.md](WEEK5_CHECKLIST.md)。

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
