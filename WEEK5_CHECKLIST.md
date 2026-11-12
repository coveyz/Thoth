# Week5：本地文档与内存索引验收

## 目标

```text
本地 Markdown/TXT
→ 安全加载与 metadata
→ Chunk
→ Batch Embedding
→ 内存快照
→ Query Embedding
→ 检索 Sources
```

本周采用完整重建和内存索引，不实现持久化、上传接口、
文档管理页面或文件自动监听。

## 验证方式

- AUTO：使用临时目录和确定性 Embedding 的自动测试。
- CHECK：类型检查、生产构建和 Git 检查。
- MANUAL：本地 API 或页面手工演示。

自动测试不调用真实模型或真实 Embedding API。
自动验证通过不代表真实 Provider 的检索质量已经评估。

## 自动化验收

以下项目依据最近一次已执行的完整回归记录勾选：
18 个测试文件、205 个测试全部通过。

- [x] 加载 UTF-8 Markdown 和 TXT。
- [x] 递归目录，忽略隐藏项、软链接和不支持的文件。
- [x] 文档排序确定，ID 根据相对路径稳定生成。
- [x] 标题、相对来源、修改时间等 metadata 正确。
- [x] 空白文件跳过并记录诊断，文档加载错误使构建失败。
- [x] Chunk 保留 metadata，配置错误明确失败。
- [x] Batch 保持顺序，校验数量、向量和失败行为。
- [x] Provider 校验响应 index 和同批向量维度。
- [x] Builder 校验跨批次维度并绑定 Chunk 与向量。
- [x] 并发构建复用同一任务，失败后允许重试。
- [x] 新快照完整构建成功后才替换旧快照。
- [x] 重建失败保留旧快照，成功空快照可以替换旧内容。
- [x] 文件新增、修改、删除后，重建与检索结果同步更新。
- [x] Sources 返回最新 metadata，不返回向量或机器绝对路径。
- [x] 后续查询复用文档向量，只生成问题向量。
- [x] 关闭 RAG 不加载文档、不构建、不调用 Embedding。
- [x] Query Embedding 接收请求 signal。
- [x] 取消共享构建的等待不取消共享任务。
- [x] 请求取消后的原始 Promise 失败有处理。
- [x] 共享构建等待或 Query Embedding 期间整体超时后，不继续发送业务结果。
- [x] 上述两个阶段客户端断开后，不再尝试发送 Sources 或启动回答流。
- [x] 停止后的后续请求仍可复用共享索引。
- [x] 文档和索引错误转换为安全 SSE 错误。
- [x] 普通聊天、工具调用和原有回归继续通过。

主要测试文件：

- loader.test.ts
- chunker.test.ts
- embeddingBatch.test.ts
- embedding.test.ts
- indexBuilder.test.ts
- indexManager.test.ts
- rebuild.test.ts
- retriever.test.ts
- runtime.test.ts
- waitForPromise.test.ts
- ragOrchestrators.test.ts
- rag.test.ts
- rag-route.test.ts

其中 `rebuild.test.ts` 验证文件变化和快照发布；
`retriever.test.ts` 进一步串联真实文件、Builder、Manager 和 Retriever，
验证新增、修改、删除后的实际检索结果。

`waitForPromise.test.ts` 和 `ragOrchestrators.test.ts` 验证取消等待、
监听器清理、后续失败处理与共享构建生命周期；
`rag-route.test.ts` 验证 HTTP/SSE 层的超时、断开连接和安全错误。

## 最终检查命令

在项目根目录执行：

```bash
pnpm -C server test
pnpm -C server exec tsc --noEmit
pnpm -C web run build
git diff --check
git diff --cached --check
git ls-files -- .env server/.env web/.env
git check-ignore server/.env
```

预期：

- Server 当前基线为 18 个测试文件、205 个测试通过。
- Server 类型检查通过。
- Web build 包含类型检查和生产构建，两者通过。
- 两种 diff 检查均无输出。
- 环境文件跟踪检查无输出。
- ignore 检查输出 server/.env。

暂存新文档后，重新执行 staged diff 检查。
未跟踪文件不会被普通 `git diff --check` 检查；新增文件应暂存后再检查。

最近一次执行结果：

- [x] Server 完整回归通过：18 个文件、205 个测试。
- [x] Server TypeScript 检查通过。
- [x] Web 类型检查与生产构建通过。
- [x] 环境文件跟踪检查无输出，server/.env 已被忽略。

以上为已执行记录；修改代码后应按改动范围重新验证。

## 手工演示

真实 Embedding 演示需要自行配置有效 Provider。
Fake Chat 不会自动提供运行时 Fake Embedding。

2026-11-12 用户提供的页面截图已确认 RAG 命中与引用展示。
其余操作没有逐项提供结果，保留待确认；未勾选不代表测试失败。

- [ ] 普通聊天与工具调用正常。
- [x] 开启 RAG，询问路线图内容，能看到对应 Sources。
- [x] 页面 Sources 显示标题、相对来源、片段正文和降序分数。
- [x] 回答说明重建失败保留成功快照，与引用正文一致。
- [x] Sources 不包含向量或机器绝对路径（自动测试验证公开字段）。
- [ ] 连续提问正常，页面能结束等待状态。
- [ ] 停止 RAG 请求后，页面恢复，可以再次提问。
- [ ] 文件更新并重启 Server 后，引用反映新内容。
- [ ] 演示完成后，清理测试文档并恢复本地配置。

截图中的问题为“Thoth Week5 如何处理索引重建失败？”。
最高分片段来自 thoth-roadmap.md，分数约 0.7653，
正文包含“重建失败时保留上一份成功快照”。
本次截图证明一条真实问答链路可用，不代表检索质量已完成系统评估。

建议问题：

```text
Thoth Week5 如何处理索引重建失败？
```

该问题的依据位于 server/knowledge/thoth-roadmap.md。
真实命中受 Embedding 模型和检索阈值影响；
若未命中，应先检查 Sources 和分数，而不是直接认定索引未更新。

文件更新演示可以在知识库中临时新增 demo.txt，
写入独特的项目说明，重启 Server 后提问。
修改内容、删除文件后，分别重启并再次观察引用。

此手工流程验证重启后的文件加载。
运行中 Manager 的完整重建、原子替换和旧快照保留，
由自动测试单独验证。

## 生命周期约定

- Runtime 每个 App 创建一次。
- 首次 RAG 按需构建，之后复用快照。
- ensureReady 不自动检测文件变化。
- rebuild 显式完整重建，不逐条更新旧索引。
- 查询持有一份完整快照。
- 当前请求取消，不取消共享构建。
- 单次 Embedding 请求有超时，整个共享构建没有新增总超时。
- 内存索引不跨进程或重启持久化。
- 重启会丢失旧快照，不能用于验证运行中重建失败时的旧快照保留。
- Fake 向量验证流程；真实检索质量还需用代表性问题评估命中、排序和阈值。

## 收口记录

- 自动回归：18 个文件、205 个测试通过。
- Server 类型检查：通过。
- Web 类型检查与生产构建：通过。
- 手工演示：RAG 命中、引用展示和回答依据已确认，其余按上表保留待确认。
- README：已补齐 Embedding 配置、索引生命周期、回归范围与 Week5 路线图。
- 配置说明：已对照 Env、Runtime 与默认索引配置核对。
- Week5 实现与自动化验收：完成。
- 其余手工演示：待逐项记录，不提前标记为全部通过。
