# Week4 Checklist：回归体系与工程化底座

## 本周目标

让 Week1 到 Week3 已经完成的能力从“能够运行”，升级为：

- 可以重复验证
- 可以快速发现回归
- 可以区分错误类型
- 可以通过 requestId 定位问题
- 可以让新环境按照文档启动

一句话总结：

> Week4 让 Thoth 从“功能跑通”升级为“功能可验证、问题可定位”。

---

## 阶段拆分

- [x] 阶段 1：建立 Week1 到 Week3 的验收矩阵
- [x] 阶段 2：建立最小自动化回归题库
- [x] 阶段 3：统一服务端错误码和前端错误展示
- [x] 阶段 4：记录 requestId、latency、provider 和 model
- [x] 阶段 5：整理环境变量、启动命令和测试说明
- [x] 阶段 6：执行最终回归并完成 Week4 收口

---

## 验收规则

每个用例使用固定编号，方便后续自动化测试和问题记录引用。

编号前缀含义：

| 前缀 | 验证范围 |
|---|---|
| `HEALTH` | 服务健康检查 |
| `CHAT` | 普通聊天 |
| `TOOL` | 工具决策与执行 |
| `RAG` | RAG 检索与回答 |
| `CONTROL` | 停止和超时控制 |
| `ERROR` | 错误协议与错误展示 |
| `OBS` | requestId、日志和可观测性 |
| `ENV` | 环境变量和启动流程 |

验证方式：

| 方式 | 说明 |
|---|---|
| API | 使用 curl 直接验证服务端 |
| UI | 使用浏览器验证交互和展示 |
| AUTO | 适合在阶段 2 转换成自动化测试 |

结果记录：

- `[ ]`：尚未验证
- `[x]`：验证通过
- `[-]`：已知阻塞，等待后续阶段处理

---

## 测试前准备

### 1. 启动服务端

```bash
cd server
pnpm dev
```

预期看到：

```text
[server] listening on http://localhost:3001
```

具体端口以 `server/.env` 中的 `PORT` 为准。

### 2. 启动前端

新开一个终端：

```bash
cd web
pnpm dev
```

预期看到类似：

```text
Local: http://localhost:5173/
```

### 3. Provider 模式说明

普通聊天和工具回归优先使用 Fake Provider。

当 `THOTH_API_KEY` 为空时，当前项目会回退到 Fake Provider：

```env
THOTH_API_KEY=
```

这样做的原因：

- 不消耗真实模型额度
- 输出固定，便于比较
- 不依赖外部网络
- 工具决策结果更稳定

注意：

> Fake Chat Provider 不等于 Fake Embedding Provider。

当前 RAG 仍然需要配置可用的 embedding 服务。因此 RAG 用例需要：

```env
THOTH_EMBEDDING_BASE_URL=你的_embedding_服务地址
THOTH_EMBEDDING_API_KEY=你的_embedding_key
THOTH_EMBEDDING_MODEL=你的_embedding_模型
```

修改 `.env` 后必须重启服务端，否则新配置不会生效。

---

# 一、基础健康检查

## HEALTH-01：服务端健康检查

验证方式：`API`、`AUTO`

执行：

```bash
curl http://localhost:3001/healthz
```

预期响应：

```json
{
  "ok": true,
  "version": "0.1.0"
}
```

验收项：

- [x] HTTP 状态码为 `200`
- [x] 响应包含 `"ok": true`
- [x] 响应包含服务版本
- [x] 服务端没有打印异常堆栈

失败时优先检查：

1. 服务端是否已经启动
2. `PORT` 是否为 `3001`
3. 当前端口是否被其他程序占用

---

# 二、普通聊天回归

## CHAT-01：Fake Provider 普通聊天

验证方式：`API`、`UI`、`AUTO`

前置配置：

```env
THOTH_API_KEY=
```

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"你好，请介绍一下自己","toolChoice":"none","rag":false}'
```

预期事件顺序：

```text
event: start
event: delta
event: delta
...
event: done
```

关键意图：

- `toolChoice: "none"` 明确禁止工具调用
- `rag: false` 明确关闭 RAG
- 这个用例只验证最基础的 Chat SSE 主链路

验收项：

- [ ] 第一类业务事件为 `start`
- [ ] `start` 包含 `requestId`
- [ ] `start` 中的 model 为 `fake-model`
- [ ] 至少收到一次 `delta`
- [ ] 没有收到 `tool_call`
- [ ] 没有收到 `sources`
- [ ] 最终收到 `done`
- [ ] `done.ok` 为 `true`

---

## CHAT-02：前端普通聊天展示

验证方式：`UI`

操作步骤：

1. 打开前端页面
2. 工具策略选择“禁用工具”
3. 不勾选 RAG
4. 输入“你好，请介绍一下自己”
5. 点击发送

验收项：

- [ ] 页面状态从“就绪”变成“生成中”
- [ ] 页面显示 requestId
- [ ] 页面显示 `fake-model`
- [ ] Assistant 内容逐步追加，而不是最后一次性出现
- [ ] 不展示 Sources
- [ ] 不展示工具调用轨迹
- [ ] 完成后页面恢复“就绪”
- [ ] 发送按钮重新可用

---

# 三、工具调用回归

## TOOL-01：自动决策调用 extract_todos

验证方式：`API`、`UI`、`AUTO`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"请提取待办：修复登录问题，补充测试，更新 README","toolChoice":"auto","rag":false}'
```

Fake Provider 会根据“待办”或“提取任务”等关键词选择 `extract_todos`。

预期事件顺序：

```text
event: start
event: tool_call
event: tool_result
event: delta
...
event: done
```

验收项：

- [x] 收到 `tool_call`
- [x] `tool_call.name` 为 `extract_todos`
- [x] `tool_call.arguments` 包含原始文本
- [x] 收到 `tool_result`
- [x] `tool_result.ok` 为 `true`
- [x] 工具结果包含待办列表
- [x] 工具执行后仍然生成最终回答
- [x] 最终收到 `done`

---

## TOOL-02：自动决策调用 summarize

验证方式：`API`、`UI`、`AUTO`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"请总结：Thoth 已经完成流式聊天、工具调用和最小 RAG，现在准备建设回归体系。","toolChoice":"auto","rag":false}'
```

验收项：

- [ ] `tool_call.name` 为 `summarize`
- [ ] 收到成功的 `tool_result`
- [ ] 最终回答使用了工具结果
- [ ] 最终收到 `done`

---

## TOOL-03：自动决策调用 make_plan

验证方式：`API`、`UI`、`AUTO`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"帮我制定一个完成 Week4 回归体系的计划","toolChoice":"auto","rag":false}'
```

验收项：

- [ ] `tool_call.name` 为 `make_plan`
- [ ] 收到成功的 `tool_result`
- [ ] 工具结果包含分步计划
- [ ] 最终收到流式回答
- [ ] 最终收到 `done`

---

## TOOL-04：禁用工具

验证方式：`API`、`UI`、`AUTO`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"请提取待办：修复登录问题","toolChoice":"none","rag":false}'
```

虽然输入中包含“待办”，但 `toolChoice: "none"` 的优先级更高。

验收项：

- [ ] 没有收到 `tool_call`
- [ ] 没有收到 `tool_result`
- [ ] 仍然收到普通回答的 `delta`
- [ ] 最终收到 `done`

---

## TOOL-05：强制调用工具

验证方式：`API`、`UI`、`AUTO`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"今天天气不错","toolChoice":"make_plan","rag":false}'
```

输入本身没有要求制定计划，但 `toolChoice` 强制指定了 `make_plan`。

验收项：

- [ ] `tool_call.name` 为 `make_plan`
- [ ] 工具确实被执行
- [ ] 收到 `tool_result`
- [ ] 最终收到 `done`

容易踩坑：

> 强制工具测试验证的是控制参数优先级，不是在验证模型能否正确理解用户意图。

---

# 四、RAG 回归

## RAG-01：RAG 命中

验证方式：`API`、`UI`，后续考虑 `AUTO`

前置条件：

- 已配置可用的 embedding provider
- `rag` 必须为 `true`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"Thoth Week3 为什么需要返回 sources？","toolChoice":"none","rag":true}'
```

预期事件顺序：

```text
event: start
event: sources
event: delta
...
event: done
```

验收项：

- [ ] 收到 `sources`
- [ ] `sources` 至少包含一个文档片段
- [ ] source 包含 `title`
- [ ] source 包含 `source`
- [ ] source 包含 `content`
- [ ] source 包含相似度 `score`
- [ ] 回答优先基于检索内容
- [ ] 回答中出现类似 `[source 1]` 的引用
- [ ] 最终收到 `done`

---

## RAG-02：RAG no-hit

验证方式：`API`、`UI`，后续考虑 `AUTO`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"南极企鹅今天中午吃了什么？","toolChoice":"none","rag":true}'
```

验收项：

- [ ] 低相关内容被 `MIN_RAG_SCORE` 过滤
- [ ] `sources` 为空或不包含明显无关片段
- [ ] 回答明确说明当前文档没有覆盖
- [ ] 回答没有编造企鹅的具体食物
- [ ] 最终收到 `done`

容易踩坑：

> no-hit 的判断受 embedding 模型和 `MIN_RAG_SCORE` 影响。阶段 1 只记录当前行为，不在 Week4 调整检索质量。

---

## RAG-03：关闭 RAG 后不返回 sources

验证方式：`API`、`UI`、`AUTO`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"Thoth Week3 为什么需要返回 sources？","toolChoice":"none","rag":false}'
```

验收项：

- [ ] 没有收到 `sources`
- [ ] 没有调用 embedding 服务
- [ ] 请求走普通聊天分支
- [ ] 最终收到 `done`

---

# 五、停止与超时回归

## CONTROL-01：前端停止生成

验证方式：`UI`

操作步骤：

1. 使用 Fake Provider
2. 不勾选 RAG
3. 发送一段较长的问题
4. 在 Assistant 仍然输出时点击“停止”

验收项：

- [ ] 点击停止后状态短暂显示“停止中”
- [ ] Assistant 不再继续追加内容
- [ ] 状态最终恢复“就绪”
- [ ] 当前 turn 的 outcome 为 `stopped`
- [ ] 页面没有停留在永久 loading 状态
- [ ] 停止后可以再次发送消息
- [ ] 服务端能观察到连接中断或上游 abort 日志

说明：

> 浏览器调用 `AbortController.abort()` 后，客户端可能收不到服务端的 `done(reason: stop)`，因为连接已经被客户端主动断开。因此前端 catch 分支也必须把当前 turn 标记为 stopped。

---

## CONTROL-02：首 Token 超时

验证方式：`API`，后续转换为 `AUTO`

临时修改 `server/.env`：

```env
THOTH_API_KEY=
THOTH_FIRST_TOKEN_TIMEOUT_MS=1
THOTH_OVERALL_TIMEOUT_MS=60000
```

重启服务端后执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"请介绍一下 Thoth","toolChoice":"none","rag":false}'
```

Fake Provider 每次输出前会等待约 `40ms`，因此 `1ms` 的首 Token 超时应该先触发。

验收项：

- [ ] 先收到 `start`
- [ ] 收到 `error`
- [ ] `error.code` 为 `FIRST_TOKEN_TIMEOUT`
- [ ] error 包含 requestId
- [ ] SSE 连接被正确结束
- [ ] 页面不会永久停留在“生成中”

验证完成后恢复：

```env
THOTH_FIRST_TOKEN_TIMEOUT_MS=10000
```

并重启服务端。

---

## CONTROL-03：整体超时

验证方式：`API`，后续转换为 `AUTO`

临时修改 `server/.env`：

```env
THOTH_API_KEY=
THOTH_FIRST_TOKEN_TIMEOUT_MS=10000
THOTH_OVERALL_TIMEOUT_MS=1
```

重启服务端并发起普通聊天请求。

验收项：

- [ ] 收到 `error`
- [ ] `error.code` 为 `OVERALL_TIMEOUT`
- [ ] error 包含 requestId
- [ ] 请求结束后没有继续写入 delta
- [ ] 服务端定时器被清理
- [ ] 前端进入可恢复的错误状态

验证完成后恢复：

```env
THOTH_OVERALL_TIMEOUT_MS=60000
```

并重启服务端。

注意：

> 超时时间的临时调整只用于手工验证，不要把 `1ms` 提交到正式配置中。

---

# 六、请求错误回归

## ERROR-01：message 缺失

验证方式：`API`、`AUTO`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{}'
```

预期：

```text
event: error
data: {"code":"BAD_REQUEST","message":"message is required","requestId":"..."}
```

验收项：

- [x] 收到 `error`
- [x] `error.code` 为 `BAD_REQUEST`
- [x] error 包含 requestId
- [x] 没有调用 Provider
- [x] 没有收到 `delta`
- [x] SSE 连接正常结束

---

## ERROR-02：message 为空字符串

验证方式：`API`、`AUTO`

执行：

```bash
curl -N http://localhost:3001/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message":"   "}'
```

验收项：

- [ ] 收到 `BAD_REQUEST`
- [ ] 没有调用 Provider
- [ ] SSE 连接正常结束

---

## ERROR-03：Provider 异常

验证方式：`API`，后续转换为 `AUTO`

该场景需要一个可以稳定抛错的 Fake Provider 行为。

当前 Fake Provider 还没有专用的错误触发机制，因此暂时记录为：

- [ ] 阶段 2 增加确定性的 Fake Provider 异常场景
- [ ] Provider 异常被转换成 SSE `error`
- [ ] error 包含稳定错误码
- [ ] error 包含 requestId
- [ ] 前端展示错误且能够恢复

注意：

> 不建议通过填写一个错误的真实 API Key 模拟这个场景，因为真实网络错误不稳定，返回格式也可能变化。

---

## ERROR-04：工具执行失败

验证方式：后续转换为 `AUTO`

当前工具会在内部捕获大部分参数错误，Fake Provider 也会生成合法参数，因此暂时记录为：

- [ ] 阶段 2 增加确定性的工具失败 fixture
- [ ] 收到 `tool_error`
- [ ] 工具失败后仍生成 fallback 回答
- [ ] 最终请求正常结束
- [ ] 工具错误不会变成永久 loading

---

# 七、requestId 与日志基线

## OBS-01：每个请求拥有独立 requestId

验证方式：`API`、`AUTO`

连续执行两次聊天请求。

验收项：

- [ ] 两次请求的 requestId 不同
- [ ] `start` 事件包含 requestId
- [ ] `error` 事件包含 requestId
- [ ] 服务端日志可以通过 requestId 关联请求
- [ ] 前端顶部展示当前 requestId

---

## OBS-02：当前日志基线

当前服务端请求结束时应输出类似：

```text
[abcd] POST /api/chat/stream - 200 123ms
```

验收项：

- [ ] 日志包含 requestId
- [ ] 日志包含 HTTP method
- [ ] 日志包含请求路径
- [ ] 日志包含 HTTP status
- [ ] 日志包含 latency
- [ ] 阶段 4 补充 provider
- [ ] 阶段 4 补充 model
- [ ] 阶段 4 补充请求 outcome

---

# 八、阶段 1 完成标准

阶段 1 不要求所有业务问题已经修复，但要求我们已经知道：

- 系统需要验证哪些主链路
- 每条链路怎样触发
- 每条链路预期产生什么事件
- 哪些用例适合自动化
- 哪些能力当前还缺少稳定测试入口

完成项：

- [x] 普通聊天用例已经定义
- [x] 工具调用用例已经定义
- [x] RAG hit 用例已经定义
- [x] RAG no-hit 用例已经定义
- [x] 停止生成用例已经定义
- [x] 首 Token 超时用例已经定义
- [x] 整体超时用例已经定义
- [x] 非法请求用例已经定义
- [x] Provider 异常缺口已经记录
- [x] 工具异常缺口已经记录
- [x] requestId 和日志基线已经记录
- [x] 已标记适合在阶段 2 自动化的场景

---

# 九、阶段 1 结论

阶段 1 的产出不是新的业务功能，而是一份统一的质量契约：

```text
用户操作或 API 输入
-> 触发确定的服务端分支
-> 产生预期的 SSE 事件
-> 前端进入预期状态
-> 请求正常结束或以明确错误结束
-> 可以通过 requestId 定位日志
```

下一阶段将从这份矩阵中选择稳定、价值高的用例，建立最小自动化回归题库。
