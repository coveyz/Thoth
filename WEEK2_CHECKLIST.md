# Week2 Checklist — 可控输出 + 工具调用

> 目的：把 Week2 的“模型决策 -> 工具执行 -> 结果回灌 -> 最终回答”记录成一份可复现的验收说明。Week2 的重点不是工具有多复杂，而是你能看清楚工具调用链路每一步发生了什么。

## 启动（本地）

- Server：`pnpm -C server dev`
- Web：`pnpm -C web dev`

配置模板见 [server/.env.example](server/.env.example)。真实 `server/.env` 不提交。

## SSE 协议（Week2 新增）

Week1 已有事件：

- `start`：`{ requestId, model }`
- `delta`：string（增量 token）
- `ping`：`{ t }`
- `done`：`{ ok: true, reason? }`
- `error`：`{ code, message, requestId? }`

Week2 新增事件：

- `tool_call`：`{ name, arguments, reason }`
- `tool_result`：`{ name, ok: true, result }`****
- `tool_error`：`{ name?, message }`

## 本周验收目标

- [x] Prompt 工程化：system prompt + JSON 结构化工具决策
- [x] 至少 1 个工具：当前已有 `extract_todos` / `summarize` / `make_plan`
- [x] 工具调用链路跑通：模型决定调用 -> 代码执行工具 -> 工具结果回灌 -> 最终流式回答
- [x] 失败兜底：工具失败时返回 `tool_error`，并进入保守 fallback 回答
- [x] 前端能展示每轮工具轨迹：工具策略、requestId、model、tool call/result/error

## 冒烟用例（已验证）

### A. 禁用工具直答

- 条件：工具策略选择“禁用工具”
- 输入示例：`你好，介绍一下你自己`
- 预期：本轮没有 `tool_call` / `tool_result`；assistant 正常流式回答
- 结果：通过

### B. 自动决策 — 提取待办

- 条件：工具策略选择“自动决策”
- 输入示例：`帮我提取待办：1. 实现登录 2. 修复聊天停止按钮 3. 优化错误提示`
- 预期：Timeline 出现 `tool_call: extract_todos`，随后出现 `tool_result`，最终回答基于工具结果
- 结果：通过

### C. 自动决策 — 总结

- 条件：工具策略选择“自动决策”
- 输入示例：`请总结：今天完成了前端工具轨迹、后端工具编排、SSE 事件扩展，但是还没做测试。`
- 预期：Timeline 出现 `tool_call: summarize`，随后出现 `tool_result`，最终回答基于工具结果
- 结果：通过

### D. 自动决策 — 制定计划

- 条件：工具策略选择“自动决策”
- 输入示例：`帮我拆一个实现 RAG 文档问答的计划`
- 预期：Timeline 出现 `tool_call: make_plan`，随后出现 `tool_result`，最终回答基于工具结果
- 结果：通过

### E. 强制工具

- 条件：工具策略选择“强制 make_plan”
- 输入示例：`我想学一下前端状态管理，帮我想想怎么开始`
- 预期：即使模型可能直答，也会强制走 `make_plan`
- 结果：通过

### F. Stop（Abort）

- 条件：最终回答流式输出过程中点击 Stop
- 预期：前端停止追加；本轮不会卡在 streaming；可再次发送
- 结果：通过

### G. Fake Provider

- 条件：不配置真实 `THOTH_API_KEY`，走 fake provider
- 预期：工具决策、工具结果、最终流式回答都稳定可复现
- 结果：通过

### H. DeepSeek 真实 Provider

- 条件：配置 `THOTH_BASE_URL=https://api.deepseek.com` + 有效 `THOTH_API_KEY` + `THOTH_MODEL=deepseek-chat`
- 预期：真实模型能按 JSON 决策工具；最终回答能流式输出；失败时不会卡住
- 结果：通过

## Week2 结论

- Week2 核心链路达标：Thoth 已经从“只会聊天”升级为“能根据请求选择工具并使用工具结果回答”。
- 当前工具主要是规则型本地工具，适合学习 Tool Calling 的基础链路。
- 下一阶段进入 RAG 前，可以先补一轮最小测试，覆盖工具决策解析、工具执行成功、工具执行失败和 SSE 事件解析。

## Week2 
   1. Tool Calling 边界
    模型负责输出工具名和参数，后端负责执行工具，模型在基于真是结果回答
   2. 两段调用
    generate 用于工具决策，要求完整，稳定可解析
    stream 用于最终回答，面向用户体验
   3. 状态设计
    meesages 保存聊天上下文
    turns 保存工具轨迹和调试信息

## 从用户点击发送开始，到前端看到第一段 assistant 正文 delta 之前，系统中间大概经历了哪些步骤
用户点击 Send
    -> store 创建 user message、当前 turn、assistant 占位消息、AbortController
    -> apiStream 用 fetch POST 请求后端，并准备解析 SSE
    -> 后端校验 message/toolChoice，初始化 SSE、abort、timeout、ping
    -> 后端选择 provider，发送 start 事件
    -> prepareAssistantTurn 根据 toolChoice 决定是否进入工具决策
    -> 如果需要工具：provider.generate 输出工具决策 JSON
    -> 后端 parse/normalize 决策
    -> 后端执行真实工具，发送 tool_call/tool_result 或 tool_error
    -> 后端构造 finalMessages
    -> route 调 provider.stream(finalMessages)
    -> 第一段 delta 通过 SSE 发给前端
    -> 前端 onDelta append 到 assistant message