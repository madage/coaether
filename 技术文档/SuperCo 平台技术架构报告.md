# SuperCo 平台技术架构报告

> 版本：v1.0
> 日期：2026-05-31
> 状态：正式

---

## 目录

1. [系统概述](#1-系统概述)
2. [总体架构](#2-总体架构)
3. [Server / Message Bus](#3-server--message-bus)
4. [Agent Runtime](#4-agent-runtime)
5. [WebSocket 通信协议](#5-websocket-通信协议)
6. [Claude Code 集成（Stream-JSON）](#6-claude-code-集成stream-json)
7. [权限审批流程](#7-权限审批流程)
8. [Web UI 前端架构](#8-web-ui-前端架构)
9. [数据流全景](#9-数据流全景)
10. [部署与运维](#10-部署与运维)

---

## 1. 系统概述

SuperCo 是一个 AI Agent 协作平台，核心能力是通过 **Message Bus（消息总线）** 连接用户前端（Web UI）和 AI Agent 后端（Claude Code），支持实时消息通信、工具调用、权限审批等完整交互。

### 1.1 核心设计原则

| 原则 | 说明 |
|------|------|
| **消息至上** | 所有通信都是结构化 JSON 消息（Envelope），无原始字节流 |
| **端点对等** | UI、Runtime、Agent 都是消息总线上的对等端点，统一寻址 |
| **实时双向** | 基于 WebSocket 的全双工通信，支持流式响应 |
| **协议中立** | Agent Runtime 通过 Backend 接口抽象，可接入不同 AI 工具 |
| **内容类型分离** | 消息内容的类型由发送方标注，前端决定如何渲染 |

### 1.2 核心组件

| 组件 | 语言 | 职责 | 状态 |
|------|------|------|------|
| **Server / Message Bus** | Go | WebSocket 总线、HTTP API、会话管理、认证 | ✅ 运行中 |
| **Agent Runtime** | Go | Claude Code 子进程管理、JSON Stream 解析、事件转发 | ✅ 运行中 |
| **Web UI** | TypeScript/React | 消息流渲染、用户交互、权限审批弹窗 | ✅ 运行中 |

---

## 2. 总体架构

### 2.1 架构图

```
┌──────────────┐     WebSocket      ┌──────────────────┐
│   Web UI     │◄──────────────────►│  Message Bus     │
│  (React)     │     /ws/bus        │  (Go / Gin)      │
│  :5173       │                    │  :8088            │
└──────────────┘                    └────────┬─────────┘
                                             │ WebSocket
                                             ▼
                                    ┌──────────────────┐
                                    │  Agent Runtime   │
                                    │  (Go)            │
                                    │  runtime://xxx   │
                                    │                  │
                                    │  stdin/stdout    │
                                    │  (pipe)          │
                                    ▼                  │
                                    ┌──────────────────┘
                                    ▼
                              ┌──────────────┐
                              │  Claude Code  │
                              │  (CLI)        │
                              │  stream-json  │
                              └──────────────┘
```

### 2.2 端点寻址模型

所有可通信实体拥有统一地址格式：

| 端点类型 | 地址格式 | 示例 |
|---------|---------|------|
| WebUI | `ui://<user-id>/<conn-id>` | `ui://user001/c1a2b3` |
| Agent Runtime | `runtime://<node-id>` | `runtime://node-001` |
| 会话通道 | `session://<session-id>` | `session://sess_abc` |
| 系统 | `system://<component>` | `system://bus` |

---

## 3. Server / Message Bus

### 3.1 技术栈

- **Web 框架**：Gin
- **数据库**：PostgreSQL（用户、会话持久化）
- **认证**：JWT（登录/注册接口）

### 3.2 HTTP API 端点

| 路径 | 说明 |
|------|------|
| `POST /api/auth/login` | 用户登录 |
| `POST /api/auth/register` | 用户注册 |
| `GET /api/health` | 健康检查 |
| `GET /api/nodes` | 节点列表 |
| `POST /api/nodes/register` | 节点注册 |
| `POST /api/sessions` | 创建会话（REST 方式） |

### 3.3 WebSocket 端点

| 路径 | 说明 |
|------|------|
| `GET /ws/bus` | **Message Bus** 主连接（UI / Runtime 均通过此接入） |
| `GET /ws/dashboard` | 仪表盘实时数据（节点/会话状态） |

### 3.4 Message Bus 核心逻辑

位于 `server/handlers/bus_handler.go` 和 `server/protocol/bus.go`：

```
1. 客户端 WebSocket 连接 → 注册为 Endpoint
2. Envelope 进入 Bus.Deliver()
3. 解析 To 地址：
   - "session://<id>" → BroadcastToSession（广播给会话内所有成员）
   - "system://bus" → 内部处理（会话创建、心跳等）
   - 其他 → 直接投递到目标连接
4. 消息投递到目标 WebSocket
```

关键数据结构：

```go
type Envelope struct {
    ID        string   // 全局唯一消息 ID
    From      string   // 发送方地址
    To        string   // 接收方地址
    Type      string   // 消息类型（message, event, tool.use 等）
    SessionID string   // 所属会话
    Payload   *Payload // 消息体
    Timestamp int64    // 时间戳
    ReplyTo   string   // 回复目标 ID
}
```

---

## 4. Agent Runtime

### 4.1 职责

Agent Runtime 是运行在每个节点上的 Go 进程，负责：

1. 向 Message Bus 注册并保持 WebSocket 连接
2. 管理 Claude Code 子进程（每个会话一个独立进程）
3. 将用户消息转发给 Claude Code 的 stdin
4. 解析 Claude Code 的 stdout（JSON Lines），转换为结构化消息
5. 处理权限审批响应
6. 空闲会话超时清理（5 分钟无活动）

### 4.2 启动流程

```
1. Runtime 启动
2. 检测 claude CLI 是否可用
3. 向 Message Bus 发送 hello，携带能力声明
4. 进入消息循环（接收消息 + 心跳 + 清理）
```

### 4.3 Backend 接口

```go
type Backend interface {
    Name() string
    Version() string
    HandleMessage(env *protocol.Envelope) (*protocol.Envelope, error)
}
```

当前支持的后端（按优先级）：

| 后端 | 优先级 | 说明 |
|------|--------|------|
| ClaudeCLI (stream-json) | 最高 | 持久子进程 + JSON Lines 解析，完整 Claude Code 功能 |
| Claude API | 中 | 直接调用 Anthropic API（无工具调用） |
| Echo | 低 | 测试用回声后端 |

### 4.4 会话管理

```go
type claudeSession struct {
    cmd          *exec.Cmd       // Claude Code 子进程
    stdin        io.WriteCloser  // 标准输入（写用户消息）
    stdout       io.ReadCloser   // 标准输出（读 JSON Lines）
    cancel       context.CancelFunc
    sessionID    string
    model        string
    lastActivity time.Time       // 最后活动时间（用于空闲清理）
}
```

- 每个会话独立启动一个 `claude --output-format stream-json` 进程
- 5 分钟无活动自动关闭（`CleanIdleSessions`）
- 会话结束时通过 `CloseSession` 终止子进程

---

## 5. WebSocket 通信协议

### 5.1 连接建立

```
ws://<host>/ws/bus?type=runtime&node_id=<id>   ← Runtime 连接
ws://<host>/ws/bus?type=ui&user_id=<id>         ← UI 连接
```

连接后立即发送 `hello` 消息声明身份和能力。

### 5.2 消息类型

#### 系统消息

| 类型 | 说明 | 方向 |
|------|------|------|
| `hello` | 端点上线注册 | Endpoint → Bus |
| `ping/pong` | 心跳（30 秒间隔） | 双向 |
| `error` | 错误报告 | 双向 |

#### 会话消息

| 类型 | 说明 | 方向 |
|------|------|------|
| `session.create` | 创建会话 | UI → Bus |
| `session.created` | 会话已创建 | Bus → UI |
| `session.join` | 加入会话 | Runtime → Bus |
| `session.joined` | 已加入会话 | Bus → 会话 |
| `session.end` | 结束会话 | Bus → Runtime |

#### 应用消息

| 类型 | 说明 | 方向 |
|------|------|------|
| `message` | 用户消息 / Agent 回复 | UI ↔ Agent |
| `event` | Agent 事件（thinking、text、tool_use 等） | Agent → UI |
| `tool.use` | 工具调用 | Agent → UI |
| `tool.result` | 工具执行结果 | → Agent |

#### 权限消息

| 类型 | 说明 | 方向 |
|------|------|------|
| `permission.request` | 权限请求（工具执行需审批） | Agent → UI |
| `permission.response` | 用户审批结果（Allow/Deny） | UI → Agent |

### 5.3 消息路由

所有消息通过 Bus 的 `Deliver()` 方法路由：

```
                    Deliver(env)
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    To = session://   To = system://   To = endpoint
          │              │              │
          ▼              ▼              ▼
   BroadcastToSession  内部处理    直接发送到连接
```

---

## 6. Claude Code 集成（Stream-JSON）

### 6.1 技术选型

Claude Code CLI 支持 `--output-format stream-json` 模式，以 **JSON Lines** 格式输出结构化的消息流。相比原始的 PTY 终端模式：

| 特性 | PTY 模式 | Stream-JSON 模式 |
|------|---------|-----------------|
| 输出格式 | ANSI 转义序列 + TUI | JSON Lines |
| 工具调用 | 终端渲染，不可编程 | 结构化 JSON，可解析 |
| Thinking | 终端渲染 | JSON content block |
| 持久进程 | 支持 | 支持 |
| 权限请求 | 终端交互 | stdio JSON（可编程） |

### 6.2 启动参数

```
claude \
  --output-format stream-json \
  --input-format stream-json \
  --permission-prompt-tool stdio \
  --verbose
```

### 6.3 输入格式（stdin）

用户消息以 JSON 格式写入子进程的 stdin：

```json
{"type":"user","message":{"role":"user","content":"你好"}}
```

### 6.4 输出格式（stdout — JSON Lines）

每行一个 JSON 对象，按事件类型分发：

| 事件类型 | subtype | 说明 |
|---------|---------|------|
| `system` | `init` | 初始化信息（session_id, tools, model, mcp_servers） |
| `assistant` | — | 回复内容，含 `content` 数组（thinking, text, tool_use） |
| `result` | `success/error` | 最终结果（duration, token 用量, cost） |
| `permission` | — | 工具执行权限请求（需用户审批） |

### 6.5 事件处理流程

```
readStdout (逐行扫描)
  │
  ├─ "system"   → 保存 model, session_id
  ├─ "assistant" → 解析 content blocks
  │                 ├─ thinking  → event (progress block)
  │                 ├─ text     → event (status + markdown)
  │                 └─ tool_use → tool.use 消息
  ├─ "result"   → event (done status + 统计信息)
  └─ "permission" → permission.request (转发到前端)
```

### 6.6 核心代码结构

```
agent-runtime/
├── runtime.go              # Runtime 主循环、消息路由
└── backends/
    ├── claude_cli.go       # Claude CLI Backend（核心：500+ 行）
    │   ├── startSession    # 启动子进程
    │   ├── readStdout      # JSON Lines 逐行解析
    │   ├── handleSystemEvent
    │   ├── handleAssistantEvent  # content blocks 分派
    │   ├── handleResultEvent
    │   ├── handlePermissionEvent # 权限请求转发
    │   ├── HandlePermissionResponse # 审批结果写入 stdin
    │   ├── processMessage  # 用户消息写入 stdin
    │   ├── CloseSession
    │   └── CleanIdleSessions
    ├── claude.go           # Claude API Backend（备用）
    └── echo.go             # Echo Backend（测试）
```

---

## 7. 权限审批流程

### 7.1 完整数据流

```
Claude Code 需要执行工具（如 Bash）
  │
  ├─ stdout: {"type":"permission","approval_id":"xxx","tool":{...}}
  │
  ▼
Agent Runtime (handlePermissionEvent)
  │
  ├─ 解析工具名、参数、approval_id
  ├─ 发送 Envelope type=permission.request → Message Bus → 会话
  │
  ▼
Web UI (PermissionDialog)
  │
  ├─ 弹出模态窗口：显示"执行 Bash 命令：ls -la"
  ├─ 用户点击 [Allow] 或 [Deny]
  │
  ├─ [Allow] → 发送 permission.response { approved: true }
  └─ [Deny]  → 发送 permission.response { approved: false }
  │
  ▼
Message Bus → Agent Runtime (HandlePermissionResponse)
  │
  ├─ 写入 claude 的 stdin:
  │   {"type":"approval","approval_id":"xxx","approved":true}
  │
  ▼
Claude Code 执行或拒绝工具
```

### 7.2 协议定义

**请求**（Runtime → UI）：

```json
{
  "type": "permission.request",
  "session_id": "sess_abc",
  "payload": {
    "tool_use_id": "approval_xxx",
    "tool": "Bash",
    "input": "{\"command\":\"ls -la\"}",
    "message": "Allow this tool call?"
  }
}
```

**响应**（UI → Runtime）：

```json
{
  "type": "permission.response",
  "session_id": "sess_abc",
  "payload": {
    "tool_use_id": "approval_xxx",
    "approved": true
  }
}
```

### 7.3 前端组件

`PermissionDialog.tsx` — 模态弹窗：

- 显示工具名称（如 Bash、Edit、Read）
- 显示工具参数（格式化 JSON）
- 提示文本
- Allow / Deny 按钮
- 半透明遮罩层

---

## 8. Web UI 前端架构

### 8.1 技术栈

- **框架**：React 18 + TypeScript
- **构建**：Vite 5
- **状态管理**：React Hooks（useState / useCallback）
- **WebSocket**：原生 WebSocket API（通过 useMessageBus hook）
- **路由**：无路由（单页应用，通过 state page 切换视图）

### 8.2 组件结构

```
src/
├── App.tsx                    # 主组件：认证、页面路由、权限弹窗
├── hooks/
│   ├── useMessageBus.ts       # WebSocket 连接管理、消息收发
│   └── useDashboardWS.ts     # 仪表盘 WebSocket
├── components/
│   ├── MessageStream.tsx      # 消息流渲染（核心：~350 行）
│   │   ├── displayName       # 发送者显示名称映射
│   │   ├── SystemMessage     # 系统消息（session 事件）
│   │   ├── ErrorMessage      # 错误消息
│   │   ├── ContentBlockRenderer  # 内容块路由
│   │   ├── TextBlock
│   │   ├── CodeBlock
│   │   ├── MarkdownBlock
│   │   ├── TableBlock
│   │   ├── StatusBlock
│   │   ├── ProgressBlock
│   │   ├── SeparatorBlock
│   │   ├── ToolUseBlock
│   │   ├── ImageBlock
│   │   └── CardBlock
│   ├── PermissionDialog.tsx   # 权限审批弹窗
│   ├── InputArea.tsx          # 消息输入框
│   ├── NodeList.tsx
│   ├── SessionList.tsx
│   ├── CreateSession.tsx
│   └── LangSwitcher.tsx
├── i18n/
│   └── context.tsx            # 国际化上下文（zh/en）
└── api/
    └── client.ts              # HTTP API 客户端
```

### 8.3 消息流渲染

`MessageStream.tsx` 支持渲染的消息类型：

| 消息类型 | 渲染方式 |
|---------|---------|
| `message` | Content blocks（text, code, markdown 等） |
| `event` | 同 `message`（thinking → progress, text → 气泡等） |
| `tool.use` | Content blocks（tool_use 块） |
| `session.created/joined` | 居中系统提示 |
| `error` | 红色错误框 |
| 其他 | JSON 原始显示（fallback） |

### 8.4 消息发送队列

首次发送消息时若尚未创建会话，前端自动执行：

```
1. 用户输入文本 → 检查 sessionID
2. 无 session → 保存消息到 pendingRef
3. 调用 bus.createSession()
4. 收到 session.created → 自动发送 pendingRef 中的消息
```

---

## 9. 数据流全景

### 9.1 发送消息

```
用户输入 "列出当前目录"
  │
  ▼
Web UI: bus.sendMessage(text)
  │  type=message, to=session://sess_abc
  ▼
Message Bus: Deliver → BroadcastToSession
  │
  ├─ UI 自身（回显）
  └─ Agent Runtime
      │
      ▼
Runtime: handleMessage → handleAgentMessage
  │  遍历 backends → 找到 claude
  ▼
ClaudeCLIBackend: processMessage
  │  {"type":"user","message":{...}}
  ▼
claude 子进程 stdin
```

### 9.2 接收回复

```
claude 子进程 stdout
  │
  ├─ {"type":"system","subtype":"init",...}
  ├─ {"type":"assistant","message":{content: [...]}}
  │   ├─ {type:"thinking",...}  → event (progress)
  │   ├─ {type:"text",...}      → event (markdown)
  │   └─ {type:"tool_use",...}  → tool.use
  └─ {"type":"result",...}      → event (done)
  │
  ▼
ClaudeCLIBackend: readStdout → handleXxxEvent
  │  构建 Envelope → sendToBus
  ▼
Message Bus → Web UI
  │  type=event / type=tool.use
  ▼
MessageStream: 渲染 content blocks
```

### 9.3 创建会话

```
用户发送第一条消息（无 session）
  │
  ▼
App: handleSendMessage
  │  pendingRef = text
  │  bus.createSession([{id:"claude"}])
  ▼
useMessageBus: send session.create
  │  type=session.create
  ▼
Message Bus: handleSessionCreate
  │  1. 生成 session_id
  │  2. 响应 session.created (→ UI)
  │  3. 转发 session.create (→ Runtime)
  ▼
Runtime: handleMessage → MsgSessionCreate
  │  发送 session.join
  ▼
Message Bus: handleSessionJoin
  │  加入会话成员表
  │  广播 session.joined
  ▼
App: useEffect 检测到 sessionID 变更
  │  pendingRef 不为空 → 自动发送消息
```

---

## 10. 部署与运维

### 10.1 依赖

| 组件 | 依赖 |
|------|------|
| Server | PostgreSQL |
| Agent Runtime | Claude CLI（已安装并可用） |
| Web UI | Node.js 18+ |

### 10.2 启动命令

```bash
# 1. 启动 Server
cd server && go run .        # 或：go build && ./superco-server

# 2. 启动 Web UI（开发模式）
cd webui && npm run dev       # → localhost:5173

# 3. 启动 Agent Runtime（连接 Server）
cd agent-runtime && go run .  # 或：go build && ./agent-runtime
```

### 10.3 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SERVER_PORT` | Server 监听端口 | `8088` |
| `POSTGRES_DSN` | PostgreSQL 连接串 | — |
| `JWT_SECRET` | JWT 签名密钥 | — |
| `SERVER_URL` | Runtime 连接的 Server 地址 | `localhost:8088` |

### 10.4 进程管理

- **Agent Runtime** 自动重连：连接断开后 3 秒自动重试
- **心跳**：30 秒间隔的 ping/pong
- **空闲清理**：60 秒扫描一次，关闭超过 5 分钟无活动的 claude 子进程
- **每个会话** 独立 claude 进程，约 200-400MB 内存

---

## 附录 A：配置文件参考

### A.1 server/.env

```ini
SERVER_PORT=8088
POSTGRES_DSN=postgres://myai:myai123@localhost:5432/myai?sslmode=disable
JWT_SECRET=superco-secret-key
```

### A.2 ~/.claude/settings.json（MCP 服务器配置）

Claude Code 启动时自动加载此配置中的 MCP 服务器，stream-json 模式的 `system.init` 事件会包含已连接的 MCP 工具列表。

## 附录 B：消息类型完整清单

| 类型常量 | 值 | 用途 |
|---------|-----|------|
| MsgHello | `hello` | 端点上线 |
| MsgPing | `ping` | 心跳 |
| MsgPong | `pong` | 心跳响应 |
| MsgError | `error` | 错误报告 |
| MsgSessionCreate | `session.create` | 创建会话 |
| MsgSessionCreated | `session.created` | 会话已创建 |
| MsgSessionJoin | `session.join` | 加入会话 |
| MsgSessionJoined | `session.joined` | 已加入会话 |
| MsgSessionEnd | `session.end` | 结束会话 |
| MsgMessage | `message` | 通用消息 |
| MsgEvent | `event` | 事件通知 |
| MsgToolUse | `tool.use` | 工具调用 |
| MsgToolResult | `tool.result` | 工具结果 |
| MsgPermissionRequest | `permission.request` | 权限请求 |
| MsgPermissionResponse | `permission.response` | 权限响应 |

---

*本文档由系统自动生成，基于当前代码库的实际实现。*
