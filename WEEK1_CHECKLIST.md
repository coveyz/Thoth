# Week1 Checklist — Chat MVP（流式体验优先）

> 目的：把 Week1 的“可验收结果”写成一份可复现的记录。你已经跑通 fake 与 DeepSeek（真实上游），并验证 Stop 与错误闭环。

## 启动（本地）

- Server：`pnpm -C server dev`
- Web：`pnpm -C web dev`

配置模板见 [server/.env.example](server/.env.example)。真实 `server/.env` 不提交（已被 [.gitignore](.gitignore) 忽略）。

## SSE 协议（Week1 约定）

- `start`：`{ requestId, model }`
- `delta`：string（增量 token）
- `ping`：`{ t }`
- `done`：`{ ok: true, reason? }`
- `error`：`{ code, message, requestId? }`

## 冒烟用例（已验证）

### A. Fake 流式输出

- 条件：清空 `THOTH_API_KEY`（或不配置真实 key）
- 预期：能持续收到 `delta`，最终 `done`；UI 正常追加
- 结果：通过

### B. DeepSeek 真实流式输出

- 条件：配置 `THOTH_BASE_URL=https://api.deepseek.com` + 有效 `THOTH_API_KEY` + `THOTH_MODEL=deepseek-chat`
- 预期：能持续收到 `delta`，最终 `done`；UI 正常追加
- 结果：通过

### C. Stop（Abort）

- 条件：流式输出过程中点击 Stop
- 预期：前端停止追加；服务端可看到 `client closed (before end)`（属于预期日志）；可再次发送
- 结果：通过

### D. 错误闭环 — 401 Invalid API Key

- 条件：配置错误的 `THOTH_API_KEY`
- 预期：前端显示 401 / invalid key 错误；不会卡在 streaming
- 结果：通过

### E. 错误闭环 — baseURL 配错 / 网络错误

- 条件：配置错误的 `THOTH_BASE_URL`（或断网）
- 预期：前端显示错误；不会卡在 streaming
- 结果：通过

## Week1 结论

- Week1 核心体验（流式输出/Stop/错误闭环/基础状态管理）达标。
- Provider 策略达标：有 key 走真实 DeepSeek，无 key 走 fake，便于稳定验收与后续扩展。
