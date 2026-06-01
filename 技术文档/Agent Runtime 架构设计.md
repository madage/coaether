# Agent Runtime 架构设计 —— 基于消息总线的 Agent 协作平台

> 版本：v2.0
> 日期：2026-06-01
> 状态：已实施

---

## 目录

1. [愿景与设计原则](#1-愿景与设计原则)
2. [总体架构](#2-总体架构)
3. [消息协议规范](#3-消息协议规范)
4. [Agent Runtime 设计](#4-agent-runtime-设计)
5. [Message Bus 设计](#5-message-bus-设计)
6. [WebUI 消息界面](#6-webui-消息界面)
7. [实施路线图](#7-实施路线图)
8. [从 PTY 架构迁移](#8-从-pty-架构迁移)
9. [附录：消息类型完整定义](#9-附录消息类型完整定义)

---

## 1. 愿景与设计原则

### 1.1 愿景

打造一个**与具体 AI 工具无关的 Agent 协作平台**。任意 AI Agent（Claude、Codex、Hermes、OpenClaw 等）以标准化的方式接入，通过消息总线进行通信、协作、共享上下文。WebUI 作为用户入口，展示结构化的消息流。

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **消息至上** | 所有通信都是结构化消息，无原始字节流（PTY） |
| **端点对等** | UI、Agent、Runtime 都是消息总线上的对等端点 |
| **渐进替换** | 阶段实施，每个阶段都是可用的，不破坏现有功能 |
| **无状态路由** | Server 只做消息路由，不解析消息内容，保持高性能 |
| **内容类型分离** | 消息内容的类型由发送方标注，前端决定如何渲染 |

---

## 2. 总体架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Message Bus (Server)                      │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │  Endpoint       │  │  Route Table   │  │  Queue & Store   │  │
│  │  Registry       │  │  endpoint→conn │  │  (Redis/RabbitMQ)│  │
│  │  谁在线、有什么  │  │  路由寻址      │  │  可靠投递        │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────────┐
           │               │                   │
           ▼               ▼                   ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐
   │   WebUI      │ │  Agent       │ │  Agent Runtime       │
   │  (React)     │ │  Native      │ │  (Go 进程, 每节点)   │
   │  WS 直连     │ │  WS 直连     │ │                      │
   └──────────────┘ └──────────────┘ │  ┌────────────────┐  │
                                     │  │  Backend       │  │
                                     │  │  Router        │  │
                                     │  └───────┬────────┘  │
                                     │          │           │
                                     │  ┌───────┼───────┐   │
                                     │  │       │       │   │
                                     │  ▼       ▼       ▼   │
                                     │ ┌───┐ ┌───┐ ┌────┐  │
                                     │ │API│ │API│ │CLI │  │
                                     │ │Adp│ │Adp│ │Adpt│  │
                                     │ └───┘ └───┘ └────┘  │
                                     │  API    API   PTY   │
                                     │  Claude Codex CLI   │
                                     └──────────────────────┘
```

### 2.2 核心组件

| 组件 | 职责 | 当前存在？ |
|------|------|-----------|
| **Message Bus** | 端点注册、消息路由、消息投递。运行在 Server 进程中 | 已实现（Message Bus） |
| **Agent Runtime** | 在每个节点上运行，托管 Agent Backend，对外暴露为消息端点 | 已实现（agent-runtime） |
| **WebUI** | 用户界面，消息流渲染，不再是终端 | 是（React 应用） |
| **Agent Backend** | 实际的 AI 工具接入层（API 调用 / CLI 封装） | 已实现（ClaudeCLI / API） |

### 2.3 端点模型

所有可通信实体都是 **Endpoint**，拥有唯一地址：

| 端点类型 | 地址格式 | 示例 |
|---------|---------|------|
| WebUI | `ui://<user-id>/<session-id>` | `ui://user001/sess_abc` |
| Agent Runtime | `runtime://<node-id>` | `runtime://node-001` |
| Agent 实例 | `agent://<runtime-id>/<agent-id>/<instance-id>` | `agent://node-001/claude/inst_001` |
| 会话通道 | `session://<session-id>` | `session://sess_abc` |
| 系统 | `system://<component>` | `system://bus` |

---

## 3. 消息协议规范

### 3.1 信封格式（Envelope）

所有消息通过总线传输时都使用统一信封：

```typescript
{
  // === 路由头 ===
  "id":        "msg_01HXYZ...",     // 全局唯一消息 ID（ULID）
  "from":      "ui://user1/sess_a", // 发送方地址
  "to":        "agent://node1/claude/inst_1", // 接收方地址
  "type":      "message",           // 消息类型（见 3.2）
  "session_id":"sess_abc",          // 所属会话

  // === 消息体 ===
  "payload": { /* 见 3.3 */ },

  // === 元数据 ===
  "timestamp": 1717200000,
  "ttl":       60000,               // 存活时间 ms（可选）
  "reply_to":  "msg_prev_id",       // 回复的目标消息 ID（可选）
  "priority":  0,                   // 优先级（可选）
}
```

**ID 生成**：使用 ULID，比 UUID 可排序、可读性强、碰撞概率低。

### 3.2 消息类型

#### 3.2.1 系统消息

| 类型 | 说明 | 方向 |
|------|------|------|
| `hello` | 端点上线注册 | Endpoint → Bus |
| `bye` | 端点离线 | Endpoint → Bus |
| `ping/pong` | 心跳 | 双向 |
| `ack` | 消息确认 | 双向 |
| `error` | 错误报告 | 双向 |

#### 3.2.2 会话消息

| 类型 | 说明 | 方向 |
|------|------|------|
| `session.create` | 创建会话 | UI → Server |
| `session.created` | 会话已创建 | Server → UI |
| `session.join` | 加入会话（agent 等） | Agent → Bus |
| `session.leave` | 离开会话 | Agent → Bus |
| `session.end` | 结束会话 | 任意 → Bus |

#### 3.2.3 应用消息

| 类型 | 说明 | 方向 |
|------|------|------|
| `message` | 通用消息，内含 content_blocks | 任意 → 任意 |
| `command` | 指令：“执行这个”、“暂停”、“停止” | UI/System → Agent |
| `event` | 事件通知：状态变更、进度更新 | Agent → UI |
| `tool.use` | Agent 调用工具 | Agent → Runtime/System |
| `tool.result` | 工具执行结果 | Runtime → Agent |

### 3.3 消息内容块（Content Blocks）

`message` 类型的 `payload.content` 是内容块数组，每个块独立标注类型：

```typescript
payload: {
  content: ContentBlock[],
  metadata?: {
    model?: string,    // 使用的模型
    tokens?: number,   // token 消耗
    duration?: number, // 耗时 ms
  }
}

type ContentBlock =
  | TextBlock
  | CodeBlock
  | MarkdownBlock
  | TableBlock
  | CardBlock
  | ImageBlock
  | FileBlock
  | ProgressBlock
  | ToolBlock
  | StatusBlock
  | SeparatorBlock;
```

#### 内联块定义

```typescript
// 文本 — 基础文字
{ type: "text", content: "你好，我是 Claude" }

// 代码 — 语法高亮渲染
{ type: "code", language: "python", content: "print('hello')", filename?: "main.py" }

// Markdown — 富文本渲染
{ type: "markdown", content: "# 标题\n**粗体**" }

// 表格
{ type: "table",
  headers: ["文件名", "行数", "大小"],
  rows: [
    ["main.go", "120", "4.2KB"],
    ["util.go", "45", "1.8KB"]
  ]
}

// 卡片 — 带交互操作
{ type: "card",
  title: "文件已创建",
  description: "/tmp/output.txt",
  actions: [
    { label: "下载",   type: "download", url: "..." },
    { label: "编辑",   type: "navigate", path: "/editor/output.txt" },
    { label: "复制路径", type: "clipboard", content: "/tmp/output.txt" }
  ]
}

// 图片
{ type: "image", mime: "image/png", url: "...", alt: "图表" }

// 文件
{ type: "file", name: "report.pdf", mime: "application/pdf", size: 1024000, url: "..." }

// 进度 — 加载动画或进度条
{ type: "progress", status: "thinking" | "running" | "done" | "error",
  message: "正在分析代码...", progress?: 0.75 }

// 工具调用 — 可折叠的详细面板
{ type: "tool_use",
  tool: "bash",
  input: "ls -la",
  output: "total 42",
  exit_code: 0,
  collapsed: true
}

// 状态 — 小标签
{ type: "status", label: "已完成", color: "green" | "yellow" | "red" | "gray" }

// 分隔线
{ type: "separator", label?: "思考过程" }
```

### 3.4 消息示例：Agent 回复

```json
{
  "id": "msg_01J2XYZ",
  "from": "agent://node-001/claude/inst_001",
  "to": "session://sess_abc",
  "type": "message",
  "session_id": "sess_abc",
  "payload": {
    "content": [
      { "type": "text", "content": "我找到了相关文件：" },
      { "type": "code", "language": "go", "content": "func main() {\n\tfmt.Println(\"hello\")\n}" },
      { "type": "table",
        "headers": ["文件", "行数"],
        "rows": [["main.go", "10"], ["util.go", "42"]]
      }
    ],
    "metadata": { "model": "claude-opus-4", "tokens": 1500 }
  },
  "timestamp": 1717200000
}
```

---

## 4. Agent Runtime 设计

### 4.1 职责

Agent Runtime 替换当前的 Agent-Node，是一个运行在每个节点上的 Go 进程。它的职责：

1. **端点注册**：向 Message Bus 注册本节点及其承载的 Agent
2. **后端路由**：将发往本节点的消息路由到正确的 Agent Backend
3. **Backend 管理**：启动、停止、监控 Agent Backend 实例
4. **健康汇报**：心跳、状态、能力上报

### 4.2 内部架构

```
┌──────────────────────────────────────────┐
│           Agent Runtime                   │
│                                          │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │  Bus Client   │  │  Endpoint        │  │
│  │  (WS 连接)    │  │  Registry        │  │
│  └──────┬───────┘  │  agent→backend   │  │
│         │          └──────────────────┘  │
│         ▼                                │
│  ┌──────────────────────────────┐        │
│  │      Backend Router          │        │
│  │  ┌──────────┐ ┌──────────┐  │        │
│  │  │ API Ada. │ │ CLI Adp. │  │        │
│  │  │ Claude   │ │ OpenClaw │  │        │
│  │  ├──────────┤ ├──────────┤  │        │
│  │  │ API Ada. │ │ Native   │  │        │
│  │  │ Codex    │ │ Hermes   │  │        │
│  │  └──────────┘ └──────────┘  │        │
│  └──────────────────────────────┘        │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │       Backend Instance Pool      │    │
│  │  ┌──────┐ ┌──────┐ ┌──────────┐ │    │
│  │  │Claude│ │Codex │ │Hermes    │ │    │
│  │  │Ins 1 │ │Ins 1 │ │Ins 1    │ │    │
│  │  └──────┘ └──────┘ └──────────┘ │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

### 4.3 Backend 类型

#### 类型 A：API Adapter（推荐，替换 PTY 的方向）

直接调用 AI 工具的 API，不走 CLI，无 PTY。

```go
type APIBackend struct {
    Name    string          // "claude"
    Client  *http.Client
    Config  BackendConfig
}

func (b *APIBackend) HandleMessage(msg Envelope) (*Message, error) {
    // 1. 解析传入消息中的 content_blocks
    // 2. 构造 API 请求
    // 3. 流式读取 API 响应
    // 4. 将响应构建为 content_blocks 返回
    // 5. 支持 tool_use/tool_result 的循环
}
```

支持的 API Backend：

| Agent | API | SDK |
|-------|-----|-----|
| Claude | Anthropic Messages API | anthropic-go |
| Codex | OpenAI Chat Completion API | openai-go |
| Hermes | Hermes Agent API | HTTP REST |

#### 类型 B：CLI Adapter（过渡方案）

临时保留 PTY 用于不支持 API 的 CLI 工具。

```go
type CLIAdapter struct {
    Command   string   // "openclaw"
    PTY       *pty.PTY
    Parser    OutputParser  // ANSI → ContentBlocks
}
```

CLI Adapter 内部使用 PTY 运行子进程，但**对外仍然输出结构化消息**。PTY 原始字节流在 Adapter 内部消化，转换为 content_blocks 后发出。

```go
// OutputParser 接口：将 PTY 输出解析为结构化内容
type OutputParser interface {
    Parse(raw []byte) []ContentBlock
}
```

对于已知工具可以实现针对性解析器：

| CLI 工具 | 解析策略 |
|---------|---------|
| claude | 检测 ANSI 转义序列包裹的文本段落 |
| openclaw | 按结构化 JSON 输出行解析 |
| hermes | 检测标记分隔符 |

#### 类型 C：Native Agent（未来）

用 Go/Node.js/Python 编写的原生 Agent，通过 WebSocket 直接连到 Message Bus，有完整的 endpoint 身份。

### 4.4 核心流程：Agent Runtime 启动

```
1. Runtime 启动
2. 扫描可用 Backend（从配置 + PATH 检测）
3. 向 Message Bus 发送 hello
   → from: "runtime://node-001"
   → payload.capabilities: ["claude", "codex", "openclaw"]
4. Bus 注册端点，广播 runtime.online 事件
5. Runtime 进入消息监听循环
```

### 4.5 核心流程：收到消息

```
Bus 投递消息到 Runtime
  │
  ├─ 消息 to = "agent://node-001/claude/inst_001"
  │
  ▼
Runtime.EndpointRegistry 查找 agent 实例
  │
  ├─ 找到 → BackendRouter 路由到对应 Backend
  │
  ▼
Backend.HandleMessage(msg)
  │
  ├─ (API Backend) → HTTP 调用 AI API → 流式响应
  │                   │
  │                   └─ 每收到一块 → 构建 ContentBlock → 发出 Message
  │
  ├─ (CLI Adapter) → PTY.Write(input) → PTY.Read(output) → Parse → 发出 Message
  │
  └─ (Native) → 内部处理逻辑 → 发出 Message
```

---

## 5. Message Bus 设计

### 5.1 职责

Message Bus 运行在 Server 进程中，核心职责：

1. **Endpoint 注册与发现**：维护在线端点的注册表
2. **消息路由**：根据 `to` 字段将消息投递到目标端点连接
3. **可靠投递**：离线消息暂存、重试
4. **会话上下文**：会话的创建、成员管理、结束

### 5.2 内部数据模型

```go
type Endpoint struct {
    ID        string            // "agent://node-001/claude"
    Addr      string            // 当前连接地址
    Conn      *websocket.Conn
    Metadata  map[string]any    // capabilities, version, etc
    LastSeen  time.Time
}

type MessageBus struct {
    mu        sync.RWMutex
    endpoints map[string]*Endpoint     // endpointID → conn
    sessions  map[string]*Session      // sessionID → session
    queues    map[string][]*Envelope   // 离线消息暂存

    // 路由
    routeTable *RouteTable             // 前缀匹配路由

    // 持久化
    store     MessageStore             // Redis 实现
}
```

### 5.3 消息路由规则

```
1. 解析 to 字段
2. 查 RouteTable：最长前缀匹配
   - "agent://node-001/claude/inst_001" → 精确匹配
   - "session://sess_abc" → 广播给会话内所有成员
   - "runtime://node-001" → 发给整个 Runtime
3. 找到目标连接
4. 投递（在线直投 / 离线暂存）
5. 发送方收到 ack（可选）
```

### 5.4 路由表结构

```go
type RouteTable struct {
    // 前缀 → 匹配规则
    rules []RouteRule
}

type RouteRule struct {
    Prefix  string   // "agent://", "session://"
    Handler RouteHandler
}

// 内置路由规则
- "ui://"      → 查找用户对应的 WebSocket 连接
- "agent://"   → 解析 runtime/node, 查找对应 Agent Runtime WS
- "session://" → 查找会话成员表，发给所有成员
- "runtime://" → 直接查找对应 Runtime 连接
- "system://"  → 内部处理
```

### 5.5 会话模型升级

```go
type Session struct {
    ID        string
    Members   map[string]MemberRole  // endpointID → role
    Metadata  map[string]any
    CreatedAt time.Time
}

type MemberRole string
const (
    RoleOwner   MemberRole = "owner"    // 创建者
    RoleMember  MemberRole = "member"   // 参与者
    RoleObserver MemberRole = "observer" // 观察者
)
```

会话创建流程：

```
1. UI 发送 session.create → Bus
   payload: { agent_ids: ["claude", "codex"] }

2. Bus 创建 Session 记录，分配 session_id

3. Bus 向目标 Runtime 发送 session.join
   → to: "runtime://node-001"
   → payload: { session_id, agent: "claude", role: "member" }

4. Runtime 在内部启动 Claude Backend 实例
   → 回复 ack

5. Bus 向所有成员发送 session.joined
   → 包括 UI

6. 会话就绪，可以开始收发消息
```

### 5.6 与现有 Server 的关系

```
当前: Gin Server (HTTP + WebSocket) + WSHub
未来: Gin Server (HTTP) + Message Bus (WebSocket)

HTTP API 仍然保留：认证、历史查询、设置等。
WebSocket 全部由 Message Bus 接管。
```

---

## 6. WebUI 消息界面

### 6.1 从"终端"到"消息流"

当前界面：

```
┌─────────────────────┐
│  xterm.js 终端      │
│  $ claude           │
│  █                  │  ← 只有等宽字体、ANSI 颜色
└─────────────────────┘
```

未来界面：

```
┌──────────────────────────────────┐
│  会话: 帮我分析代码                │
│                                  │
│  ┌─────────────────────────┐     │
│  │  Claude Code            │     │
│  │                         │     │
│  │  我分析了以下文件：       │     │
│  │                         │     │
│  │  ┌─── 文件列表 ───────┐ │     │
│  │  │ main.go  | 120行  │ │     │
│  │  │ util.go  |  45行  │ │     │
│  │  └──────────────────┘ │     │
│  │                         │     │
│  │  ┌─── main.go ────────┐ │     │
│  │  │ func main() {      │ │     │
│  │  │   fmt.Println()    │ │     │
│  │  │ }                  │ │     │
│  │  └──────────────────┘ │     │
│  │                         │     │
│  │  [思考中...]            │     │
│  │                         │     │
│  │  ┌────────────────────┐ │     │
│  │  │ 输入消息... [发送] │ │     │
│  │  └────────────────────┘ │     │
│  └─────────────────────────┘     │
└──────────────────────────────────┘
```

### 6.2 组件架构

```
MessageStream
  ├─ MessageBubble (from: "Claude Code")
  │    ├─ TextBlock      → <p> 文本段落
  │    ├─ CodeBlock      → <SyntaxHighlighter> + 复制按钮
  │    ├─ MarkdownBlock  → <ReactMarkdown>
  │    ├─ TableBlock     → <table> 组件
  │    ├─ CardBlock      → <Card> 带操作按钮
  │    ├─ ImageBlock     → <img> 或 <Lightbox>
  │    ├─ FileBlock      → <FileCard> 下载链接
  │    ├─ ProgressBlock  → <ProgressBar> / <Spinner>
  │    ├─ ToolBlock      → <Collapsible> 工具调用详情
  │    ├─ StatusBlock    → <Badge> 状态标签
  │    └─ SeparatorBlock → <hr> 分隔线
  │
  ├─ MessageBubble (from: "你")
  │    └─ TextBlock
  │
  └─ InputArea
       ├─ TextInput (markdown 输入)
       ├─ SendButton
       └─ 附属文件/图片
```

### 6.3 xterm.js 的定位

xterm.js 不再是主要界面，而是作为**降级回退**和**高级用户选项**：

- 默认界面：消息流渲染
- 可切换到 "原始终端模式"：xterm.js 显示完整输出
- 适配器 API Backend 不需要 xterm.js

---

## 7. 实施路线图

> ✅ 阶段 1~3 已完成，阶段 4 按需推进

### 阶段 1：协议层 + Message Bus 核心（✅ 已完成）

| 任务 | 涉及 | 工作量 |
|------|------|--------|
| 定义完整消息协议（Envelope + ContentBlocks） | 文档 | 小 |
| 实现 Message Bus：Endpoint 注册/路由/投递 | server/ | 中 |
| 实现新 WebSocket 协议处理（替代 WSHub） | server/ | 中 |
| 重构会话模型（Session Members + 消息转发） | server/ | 中 |
| 实现 session.create/join/leave/end 流程 | server/ | 中 |
| 现有 HTTP API 保持不变 | server/ | 无 |

**结果**：Message Bus 可运行，旧 WebUI 暂时保持终端模式，底层协议更换为新的 Envelope 格式。

### 阶段 2：Agent Runtime + API Adapter（✅ 已完成）

| 任务 | 涉及 | 工作量 |
|------|------|--------|
| 实现 Agent Runtime：Bus Client + Endpoint Registry | agent-runtime/ | 大 |
| 实现 Claude API Adapter（Anthropic Go SDK） | agent-runtime/ | 中 |
| 实现 Codex API Adapter（OpenAI Go SDK） | agent-runtime/ | 中 |
| Backend Router：按消息路由到正确 Backend | agent-runtime/ | 中 |
| Agent Runtime 扫描器（替代当前 scanner） | agent-runtime/ | 小 |

**结果**：Agent Runtime 可用，Claude/Codex 通过 API 运行，无 PTY。旧的 agent-node 保留用于 CLI 工具。

### 阶段 3：新 WebUI 消息流（✅ 已完成）

| 任务 | 涉及 | 工作量 |
|------|------|--------|
| 实现 MessageStream 组件 | webui/ | 大 |
| 实现所有 ContentBlock 渲染组件 | webui/ | 中 |
| 实现 InputArea（markdown 输入） | webui/ | 中 |
| 消息 WebSocket 连接（新协议） | webui/ | 小 |
| 保留 xterm.js 模式切换 | webui/ | 小 |

**结果**：新的消息流界面可用，用户可以体验结构化回复。

### 阶段 4：高级特性（按需）

| 特性 | 工作量 |
|------|--------|
| 可靠投递 + 离线消息暂存 | 中 |
| 多 Agent 会话（一个会话同时运行 claude + codex） | 大 |
| Native Agent SDK（Go/Node.js/Python） | 大 |
| 工具注册与发现（MCP 兼容层） | 大 |
| 消息持久化 + 会话历史回放 | 中 |
| 前端 xterm.js 切换模式 | 小 |

---

## 8. 从 PTY 架构迁移（历史记录）

> 迁移已完成。旧版 agent-node 已移除，WSHub 已清理，当前全面使用 agent-runtime + Message Bus 架构。

### 8.1 双轨并行策略（历史）

迁移期间，新旧架构同时运行：

```
Message Bus  ←── WebUI (新协议)
     │
     ├── Runtime (新) ←── API Adapter ←── Claude API
     │
     └── Legacy Bridge (过渡) ←── Agent-Node (旧) ←── PTY ←── CLI
```

**Legacy Bridge**：一个适配器，让旧 agent-node 看起来像个新 Runtime。它把 PTY 字节流在桥接端解析为 content_blocks。

### 8.2 迁移步骤

```
Step 1: 部署 Message Bus（与 WSHub 共存）
Step 2: 开发 Runtime + API Adapter
Step 3: 部署 Runtime（与 Agent-Node 共存）
Step 4: WebUI 支持新协议
Step 5: 逐个将 CLI 工具替换为 API Adapter
Step 6: 下线 Agent-Node + PTY
Step 7: 清理 WSHub 旧代码
```

### 8.3 对当前进度的影响

| 已完成的代码 | 迁移策略 |
|-------------|---------|
| Scanner（检测 PATH 中的 agent） | 保留，移到 Runtime 中 |
| agent_list 上报 | 保留，移到 Runtime 的 hello 消息中 |
| Agent-Node WS 连接 | 由 Runtime 的 Bus Client 替代 |
| WSHub.forwardToNode | 由 RouteTable 替代 |
| WSHub.NodesBySess | 由 Session.Members 替代 |
| TriggerScan 端点 | 保留，扫描逻辑移到 Runtime |

---

## 9. 附录：消息类型完整定义

### 9.1 系统消息

#### hello

```json
{
  "id": "msg_hello_001",
  "from": "runtime://node-001",
  "to": "system://bus",
  "type": "hello",
  "payload": {
    "endpoint_type": "runtime",
    "capabilities": [
      { "id": "claude",  "name": "Claude Code",  "version": "2.1.143", "backend": "api" },
      { "id": "codex",   "name": "Codex",         "version": "0.128.0", "backend": "api" },
      { "id": "openclaw","name": "OpenClaw",      "version": "2026.5.28", "backend": "cli" }
    ],
    "node_info": { "os": "darwin", "arch": "amd64" }
  }
}
```

#### error

```json
{
  "id": "msg_err_001",
  "from": "runtime://node-001/claude/inst_001",
  "to": "session://sess_abc",
  "type": "error",
  "payload": {
    "code": "RATE_LIMITED",
    "message": "API rate limit exceeded, retry in 5s",
    "retry_after": 5000
  }
}
```

### 9.2 会话消息

#### session.create

```json
{
  "id": "msg_sc_001",
  "from": "ui://user001/browser_1",
  "to": "system://bus",
  "type": "session.create",
  "payload": {
    "agents": [
      { "id": "claude", "model": "claude-opus-4-7", "instance_id": "inst_001" }
    ],
    "workspace": "/home/user/project",
    "context": { "cwd": "/home/user/project" }
  }
}
```

#### session.created（响应）

```json
{
  "id": "msg_sc_002",
  "from": "system://bus",
  "to": "session://sess_abc",
  "type": "session.created",
  "payload": {
    "session_id": "sess_abc",
    "members": [
      { "endpoint": "ui://user001/browser_1", "role": "owner" },
      { "endpoint": "agent://node-001/claude/inst_001", "role": "member" }
    ]
  }
}
```

### 9.3 应用消息

#### message（包含各类 content_block）

```json
{
  "id": "msg_m_003",
  "from": "agent://node-001/claude/inst_001",
  "to": "session://sess_abc",
  "type": "message",
  "session_id": "sess_abc",
  "payload": {
    "content": [
      { "type": "status", "label": "思考中", "color": "yellow" },
      { "type": "text", "content": "让我分析你的代码..." },
      { "type": "code", "language": "go", "filename": "main.go",
        "content": "package main\n\nfunc main() {\n\tfmt.Println(\"hello\")\n}" },
      { "type": "card",
        "title": "分析完成",
        "description": "main.go 包含一个简单的入口函数",
        "actions": [
          { "label": "运行", "type": "command", "command": "go run main.go" }
        ]
      },
      { "type": "progress", "status": "done", "message": "分析完毕" }
    ],
    "metadata": { "model": "claude-opus-4-7", "tokens": 1234 }
  },
  "timestamp": 1717200000
}
```

#### tool.use / tool.result（Agent 调用工具的完整周期）

```json
// 阶段 1：Agent 决定调用工具
{
  "id": "msg_tu_001",
  "from": "agent://node-001/claude/inst_001",
  "to": "runtime://node-001",
  "type": "tool.use",
  "session_id": "sess_abc",
  "payload": {
    "tool_use_id": "tu_01",
    "tool": "bash",
    "input": { "command": "ls -la" }
  }
}

// 阶段 2：Runtime 执行工具并返回结果
{
  "id": "msg_tr_001",
  "from": "runtime://node-001",
  "to": "agent://node-001/claude/inst_001",
  "type": "tool.result",
  "session_id": "sess_abc",
  "payload": {
    "tool_use_id": "tu_01",
    "output": "total 42\ndrwxr-xr-x  user staff 128 May 31 10:00 .",
    "exit_code": 0
  }
}

// 阶段 3：广播给 UI（可选，前端渲染工具调用）
{
  "id": "msg_m_004",
  "from": "agent://node-001/claude/inst_001",
  "to": "session://sess_abc",
  "type": "message",
  "session_id": "sess_abc",
  "payload": {
    "content": [
      { "type": "tool_use", "tool": "bash", "input": "ls -la",
        "output": "total 42...", "exit_code": 0, "collapsed": true }
    ]
  }
}
```

---

## 总结

这个架构的核心思想：

1. **去掉 PTY** —— 转向消息，所有通信都是结构化的
2. **消息总线** —— Server 升级为路由层，不再只是透传
3. **对等端点** —— UI、Agent、Runtime 都是总线上的对等节点
4. **渐进替换** —— API Adapter 逐步替代 CLI + PTY
5. **前端自由** —— 按 ContentBlock 类型渲染，不受终端限制

你的项目刚启动，改架构代价最小。要不要我细化某个阶段的具体实现？
