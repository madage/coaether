```mermaid
flowchart TB
    subgraph Server["服务器 (Go)"]
        Bus["Message Bus"]
        WS["WebSocket Handler<br/>(/ws/bus)"]
        DashHub["Dashboard Hub<br/>(WebSocket /ws/dashboard)"]
        NodeAPI["Node API<br/>(Start/Stop/List)"]
        DB[("PostgreSQL<br/>节点/会话/消息")]
    end

    subgraph Node["用户机器"]
        Runtime["agent-runtime.exe<br/>(Go 进程)"]
        EnvFile["~/.coaether/env<br/>SERVER_URL<br/>NODE_SECRET<br/>NODE_ID"]
        Backends["后端代理层"]
        ClaudeCLI["Claude Code CLI"]
        EchoBackend["Echo Backend<br/>(兜底)"]
    end

    subgraph WebUI["Web UI (React)"]
        DashClient["Dashboard WS 客户端"]
    end

    %% 注册/连接流程
    EnvFile -->|读取配置| Runtime
    Runtime -->|WebSocket 连接<br/>?type=runtime&secret=xxx| WS
    WS -->|验证 secret<br/>查询 DB| DB
    WS -->|注册端点| Bus
    Runtime -->|发送 Hello<br/>(能力声明)| WS
    WS -->|更新端点能力| Bus

    %% 启动流程（服务器触发）
    NodeAPI -->|POST /api/nodes/:id/start<br/>1. 生成 secret<br/>2. 保存到 env 和 DB<br/>3. exec agent-runtime| Runtime
    NodeAPI -->|广播 node_status:online| DashHub
    WS -->|节点连接后广播| DashHub
    DashHub -->|WebSocket 推送| DashClient

    %% 消息处理流程
    DashClient -->|创建会话| WS
    WS -->|MsgSessionCreate| Bus
    Bus -->|转发给 runtime| Runtime
    Runtime -->|MsgSessionJoin<br/>加入会话| WS
    Runtime -->|MsgMessage| Backends
    Backends --> ClaudeCLI
    Backends --> EchoBackend
    ClaudeCLI -->|响应结果| Runtime
    EchoBackend -->|响应结果| Runtime
    Runtime -->|MsgMessage 返回| WS
    WS -->|存入 DB| DB
    WS -->|转发给 UI| DashClient

    %% 停止流程
    NodeAPI -->|POST /api/nodes/:id/stop<br/>exec agent-runtime stop| Runtime
```

## 架构概述

CoAether 的 Runtime Agent 是一个独立的 Go 进程，运行在用户机器上，通过 WebSocket 连接到服务器。

### 核心组件

- **agent-runtime.exe** — 部署在用户机器上的 Go 进程，负责与 AI 后端（如 Claude Code CLI）交互
- **Message Bus** — 服务器端的内存消息路由器，管理端点注册、会话和消息投递
- **Backend 代理层** — Runtime 内部的抽象层，支持多种 AI 后端实现
- **Dashboard Hub** — 服务器端 WebSocket 管理器，向 Web UI 推送实时状态

### 工作流程

1. **节点注册/连接**
   - Runtime 从 `~/.coaether/env` 读取 `NODE_SECRET`
   - 通过 WebSocket 连接到 `/ws/bus?type=runtime&secret=xxx`
   - 服务器验证 secret 后注册端点，更新 DB 状态为 online
   - 发送 `Hello` 消息声明能力（支持哪些 agent 类型）

2. **启动/停止管理**
   - Web UI 点击"启动" → 服务器 Node API 生成新 secret，保存到 env 文件和 DB
   - 通过 `exec.Command` 启动 `agent-runtime.exe start --secret xxx`
   - Runtime 进程保持前台运行，通过 signal 接收停止命令

3. **消息处理**
   - UI 创建会话 → 服务器转发 `MsgSessionCreate` 给 runtime
   - Runtime 加入会话（`MsgSessionJoin`）
   - 收到用户消息后，路由到对应 backend 处理
   - Claude CLI Backend 调用本地 `claude` 命令行
   - 结果返回给服务器，服务器转发给 UI

4. **断线重连**
   - WebSocket 断开后，Runtime 的 `runLoop()` 每 3 秒重试一次
   - 使用 `NODE_SECRET` 重新连接，无需重新注册

### 关键设计

- **WebSocket 直连**: Runtime 直接连接服务器，不经过反向代理
- **持久化 Secret**: `node_secret` 存储在 `~/.coaether/env`，支持服务器重启后自动重连
- **后端抽象**: Backend 接口允许添加新的 AI 后端实现（Claude API、Claude CLI、Echo 等）
- **Secret 而非 Token**: 一次注册后，使用持久 secret 而非一次性 token 进行身份验证
