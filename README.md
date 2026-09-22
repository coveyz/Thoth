# Thoth

Thoth 是一个学习型 AI Chat 与知识库问答项目，目前支持：

- SSE 流式聊天
- 停止生成
- Fake / DeepSeek OpenAI-compatible Chat Provider
- 本地工具调用
- RAG 文档检索
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

RAG 使用独立的 Embedding Provider：

```env
THOTH_EMBEDDING_BASE_URL=https://api.openai.com/v1
THOTH_EMBEDDING_API_KEY=你的真实密钥
THOTH_EMBEDDING_MODEL=text-embedding-3-small
```

也可以使用支持 OpenAI-compatible Embedding API 的其他 Provider。

需要注意：

> Fake Chat Provider 不包含运行时 Fake Embedding Provider。

当 `THOTH_EMBEDDING_API_KEY` 为空时：

- 普通聊天仍然可用
- 工具调用仍然可用
- 开启 RAG 会返回 `EMBEDDING_ERROR`

自动测试中的 RAG 使用 Vitest Mock Embedding，不会调用真实 API。

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

自动测试固定使用 Fake Chat Provider 和 Mock Embedding，不需要真实 API Key。

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
  -d '{"message":"Thoth Week3 为什么需要返回 sources？","toolChoice":"none","rag":true}'
```

预期事件顺序：

```text
start
→ sources
→ delta
→ done
```

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
