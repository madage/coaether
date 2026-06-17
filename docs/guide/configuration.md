# 配置参考

本章是 CoAether 所有配置项的完整参考，包括节点配置、智能体配置和工作流配置。

## 节点配置（config.yml）

配置文件位置：`~/.coaether/config.yml`

### 完整示例

```yaml
# ===== 连接配置 =====
server: wss://www.coaether.cn/ws
token: "coaether_node_xxxxxxxxxxxx"

# ===== 节点标识 =====
name: "生产服务器-01"

# ===== 并发控制 =====
max_sessions: 5

# ===== 路径配置 =====
workspace_dir: ~/.coaether/sessions
log_dir: ~/.coaether/logs

# ===== 日志配置 =====
log_level: info

# ===== 网络配置 =====
proxy: ""

# ===== 模型配置 =====
models:
  ollama:
    base_url: http://localhost:11434
    default_model: qwen2.5:14b
```

### 配置项说明

#### server

- **类型**：`string`
- **必填**：是
- **说明**：CoAether 平台的 WebSocket 地址
- **格式**：`wss://<域名>/ws`
- **示例**：`wss://www.coaether.cn/ws`

#### token

- **类型**：`string`
- **必填**：是
- **说明**：节点接入令牌，在平台「节点管理」→「生成令牌」获取
- **注意**：一个令牌只能绑定一个节点，使用后即绑定
- **格式**：`coaether_node_` 开头

#### name

- **类型**：`string`
- **必填**：否
- **默认值**：自动生成（主机名 + 随机后缀）
- **说明**：在平台上显示的节点名称，方便识别
- **示例**：`"北京机房-API 节点 01"`

#### max_sessions

- **类型**：`int`
- **必填**：否
- **默认值**：`3`
- **范围**：`1` - `20`
- **说明**：最大并发会话数，即节点同时处理的任务数上限
- **建议**：不超过 CPU 核心数

#### workspace_dir

- **类型**：`string`
- **必填**：否
- **默认值**：`~/.coaether/sessions`
- **说明**：会话工作区文件的存储目录。智能体执行任务时产生的文件在这里
- **注意**：确保磁盘空间充足，定期清理不需要的旧会话

#### log_dir

- **类型**：`string`
- **必填**：否
- **默认值**：`~/.coaether/logs`
- **说明**：日志文件存储目录

#### log_level

- **类型**：`enum`
- **必填**：否
- **默认值**：`info`
- **可选值**：

| 级别 | 说明 |
|------|------|
| `debug` | 最详细日志，包含所有请求响应体，仅调试时使用 |
| `info` | 正常操作日志：连接、任务开始/完成、Token 消耗 |
| `warn` | 警告信息：重试、连接波动、资源接近上限 |
| `error` | 仅错误信息：连接失败、任务异常、配置错误 |

#### proxy

- **类型**：`string`
- **必填**：否
- **默认值**：`""`（不使用代理）
- **说明**：HTTP 代理地址，用于通过代理连接外部 API
- **格式**：`http://host:port` 或 `socks5://host:port`
- **示例**：`http://proxy.corp.com:8080`

#### models.ollama

- **类型**：`object`
- **必填**：否
- **说明**：本地 Ollama 模型服务器配置

| 子项 | 类型 | 说明 |
|------|------|------|
| `base_url` | string | Ollama 服务地址，默认 `http://localhost:11434` |
| `default_model` | string | 默认使用的模型名称，如 `qwen2.5:14b` |

---

## 任务配置

创建任务时可设置的参数：

```json
{
  "title": "任务标题",
  "description": "详细描述",
  "priority": "medium",
  "auto_assign": true,
  "max_depth": 5,
  "max_agent_loops": 12,
  "completion_behavior": "needs_review",
  "token_budget": 100000
}
```

### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `title` | string | — | 任务标题（必填） |
| `description` | string | — | 详细描述，支持 Markdown |
| `priority` | enum | `medium` | `low` / `medium` / `high` |
| `auto_assign` | bool | `false` | 是否开启智能体自动分配和工作流 |
| `max_depth` | int | `5` | 子任务拆解的最大层级深度 |
| `max_agent_loops` | int | `12` | 审核驳回后最大重试循环次数 |
| `completion_behavior` | string | `auto_done` | 见下表 |
| `token_budget` | int | `100000` | 工作流 Token 预算上限 |
| `due_at` | timestamp | — | 截止日期 |

### completion_behavior

| 值 | 行为 |
|------|------|
| `auto_done` | 智能体完成后自动标记为完成 |
| `needs_review` | 完成后必须经过审核师审核 |
| `manual` | 始终需要人工确认 |

---

## 智能体配置

### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | string | — | 智能体名称（必填） |
| `description` | string | — | 角色描述 |
| `avatar` | string | `"🤖"` | 头像 emoji |
| `model` | string | — | 使用的 LLM 模型（必填） |
| `system_prompt` | text | — | 系统提示词 |
| `instruction_template` | text | — | 指令模板，支持 Go 模板变量 |
| `capabilities` | json | `{}` | 能力声明（工具集） |
| `max_concurrency` | int | `2` | 最大并发处理任务数 |
| `enabled` | bool | `true` | 是否启用 |
| `tags` | json[] | `[]` | 标签，用于分类和匹配 |

### capabilities 可用的工具

```json
{
  "tools": [
    "get_task_detail",
    "add_comment",
    "update_task_status",
    "search_agent_profiles",
    "propose_decomposition_plan",
    "review_task",
    "web_search"
  ]
}
```

| 工具 ID | 功能 | 典型使用者 |
|---------|------|-----------|
| `get_task_detail` | 获取任务详情和评论 | 所有智能体 |
| `add_comment` | 添加评论 | 所有智能体 |
| `update_task_status` | 更新任务状态 | 执行智能体 |
| `search_agent_profiles` | 搜索工作区内的智能体 | 任务委派专家 |
| `propose_decomposition_plan` | 提交任务拆解计划 | 任务委派专家 |
| `review_task` | 提交审核意见 | 审核师 |
| `web_search` | 联网搜索 | 搜索师 |

---

## 工作流配置

### 状态机

```yaml
# 工作流状态流转
active → completed    # 全部子任务完成
active → paused       # 用户手动暂停
active → cancelled    # 用户手动取消
active → escalated    # 触发升级机制
```

### 升级触发条件

| 触发条件 | 升级级别 | 动作 |
|----------|---------|------|
| Token 预算耗尽 | 2 | 暂停工作流，通知创建者 |
| 审核循环超限 | 2 | 标记任务人工处理 |
| 智能体全部离线 > 5min | 1 | 通知管理员 |
| 任务超时（超过 due_at） | 1 | 通知指派人 |
| 子任务依赖死锁 | 3 | 强制暂停，人工介入 |

---

## 环境变量（Docker 部署）

使用 Docker 部署时，配置通过环境变量传入：

| 环境变量 | 对应配置项 | 默认值 |
|---------|-----------|--------|
| `COAETHER_SERVER` | `server` | `wss://www.coaether.cn/ws` |
| `COAETHER_TOKEN` | `token` | —（必填） |
| `COAETHER_NAME` | `name` | 容器 hostname |
| `COAETHER_MAX_SESSIONS` | `max_sessions` | `3` |
| `COAETHER_LOG_LEVEL` | `log_level` | `info` |
| `COAETHER_PROXY` | `proxy` | — |
| `COAETHER_OLLAMA_URL` | `models.ollama.base_url` | `http://localhost:11434` |
| `COAETHER_OLLAMA_MODEL` | `models.ollama.default_model` | — |

示例：

```bash
docker run -d \
  --name coaether-node \
  -e COAETHER_TOKEN="coaether_node_xxx" \
  -e COAETHER_SERVER="wss://www.coaether.cn/ws" \
  -e COAETHER_MAX_SESSIONS=5 \
  -e COAETHER_LOG_LEVEL=info \
  ghcr.io/madage/coaether-agent-runtime:latest
```
