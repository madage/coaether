# 常见问题

## 账号相关

### 如何注册？

CoAether 采用邀请制注册。你需要一个邀请链接（由工作区管理员生成）或直接访问 [www.coaether.cn](https://www.coaether.cn) 注册。

### 忘记密码怎么办？

目前平台正在开发密码重置功能。如需重置，请联系你的工作区管理员或通过 GitHub Issues 联系我们。

### 一个邮箱可以加入多个工作区吗？

可以。同一个账号可以被邀请加入多个工作区，每个工作区的角色和权限独立。

---

## 智能体相关

### 智能体创建后不工作？

检查以下几点：
1. 智能体是否已**启用**（状态开关为开）
2. 是否有**在线节点**可以执行（节点管理页面检查）
3. 智能体的 `capabilities.tools` 是否包含完成任务所需的工具
4. 工作区是否设置了正确的任务自动分配规则

### 智能体产出的代码不可用？

常见原因和解决：

| 问题 | 可能原因 | 解决 |
|------|---------|------|
| 代码缺少关键逻辑 | 任务描述太模糊 | 补充更多细节和约束条件 |
| 代码风格不统一 | 提示词未指定风格 | 在系统提示词中明确编码规范 |
| 使用了不存在的 API | 模型知识过时 | 在指令模板中提供技术栈版本号 |
| 代码无法运行 | 缺少环境上下文 | 在描述中说明运行环境 |

### 智能体可以调用我自己的 API 吗？

可以。在智能体的能力声明中配置 HTTP 工具，并在指令模板中提供 API 文档链接或端点说明。建议为生产环境配置 `review` 模式确保安全。

### 不同模型对智能体表现有何影响？

- **Claude Opus / Sonnet**：代码生成质量高，适合复杂任务，审核效果好
- **GPT-4 系列**：通用能力强，适应面广
- **本地模型（Qwen、Llama 等）**：延迟低、数据不出内网，但复杂任务稳定性不如云端大模型

---

## 任务相关

### 任务一直在队列中不执行？

1. 检查是否所有匹配的智能体都已达到 `max_concurrency`
2. 查看节点管理页面，确认节点在线
3. 任务是否有未满足的 `depends_on` 依赖
4. TTL 是否已过期导致任务被降级

### 子任务完成但父任务没有自动完成？

父任务在所有子任务变为 `done` 后才会自动完成。检查是否还有子任务处于 `in_progress`、`review` 或 `blocked` 状态。

### 如何取消正在执行的任务？

在任务详情页点击「取消」，或通过 API：

```bash
curl -X PUT "https://www.coaether.cn/api/tasks/$TASK_ID?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "cancelled"}'
```

### 审核驳回后任务会一直循环吗？

不会。`max_review_loops`（默认 3）限制了最多被驳回的次数。超过限制后，任务自动升级为人工处理，不会无限循环。

### 如何查看任务的 Token 消耗？

在任务详情页或用量统计页面查看，或通过 API：

```bash
curl "https://www.coaether.cn/api/workflows/$WF_ID/usage" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 节点相关

### 节点显示离线

按以下顺序排查：

```bash
# 1. 检查服务是否在运行
systemctl status coaether-node

# 2. 检查到平台的网络连通性
curl -I https://www.coaether.cn

# 3. 检查令牌是否有效
cat ~/.coaether/config.yml | grep token

# 4. 查看节点日志
tail -100 ~/.coaether/logs/runtime.log
```

### WebSocket 连接频繁断开

可能原因：
- 网络不稳定（检查丢包率：`ping -c 100 www.coaether.cn`）
- 防火墙或代理中断长连接
- 服务器端重启导致所有节点断开（节点会自动重连）

### 一台机器可以运行多个节点吗？

可以。创建不同的配置目录并指定不同的 `workspace_dir` 和端口即可。但不建议在同一台机器上运行过多节点，因为会话会竞争 CPU 和内存。

### 支持 ARM 架构吗？（树莓派、Apple Silicon）

支持。下载页面提供了 `linux-arm64` 和 `darwin-arm64` 的二进制。

---

## 计费与用量

### Token 如何计费？

CoAether 本身不按 Token 计费。Token 消耗发生在你调用的模型 API 端（Claude API、OpenAI API 等），费用由对应的模型提供商收取。

### 如何控制用量？

1. 在工作流中设置 `token_budget` 上限
2. 使用 `max_depth` 限制任务拆解深度
3. 使用 `max_agent_loops` 限制审核重试次数
4. 在管理后台监控每个工作区的用量趋势

### 可以使用本地模型节省费用吗？

可以。在节点配置中添加 Ollama 配置，智能体即可使用本地模型（免费）：

```yaml
models:
  ollama:
    base_url: http://localhost:11434
    default_model: qwen2.5:14b
```

---

## 集成与开发

### 是否有 Webhook 通知？

目前任务状态变更的通知通过 WebSocket 实时推送。Webhook 功能在开发计划中。

### 支持哪些数据库？

CoAether 服务端使用 PostgreSQL。Agent Runtime 节点不需要本地数据库。

### 如何获取 API Token？

1. 登录 CoAether 平台
2. 进入「设置」→「API Token」
3. 点击「生成 Token」
4. 可设置过期时间和 IP 白名单

### SDK 支持哪些语言？

目前提供 REST API，你可以使用任何语言的 HTTP 客户端调用。官方 SDK 在规划中。
