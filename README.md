# Superco - AI Agent Distributed Scheduling Platform / AI Agent 分布式调度平台

[EN] Cross-platform AI Agent scheduling platform with Web UI chat, Go backend, and Message Bus architecture.
[CN] 跨平台 AI Agent 分布式调度平台，提供 Web 聊天界面、Go 后端服务和消息总线架构。

## Architecture

```
superco/
├── server/         # Go + Gin + WebSocket backend server
├── agent-runtime/  # Agent Runtime (connects via Message Bus)
└── webui/          # React + TypeScript + Vite chat interface
```

## Quick Start / 快速开始

### 1. Server / 启动后端

```bash
cd server
go run .
# Starts on :8088
```

> Requires PostgreSQL. / 需要本地运行 PostgreSQL。

### 2. Web UI / 启动前端

```bash
cd webui
npm install
npm run dev
# Opens on localhost:5173
```

### 3. Agent Runtime / 启动运行时

```bash
cd agent-runtime
go build -o agent-runtime .
./agent-runtime
# Connects to ws://localhost:8088/ws/bus
```

> Requires `claude` CLI in PATH. / 需要 `claude` 命令在 PATH 中。

## Project Structure / 项目结构

```
superco/
├── server/         # Go + Gin + Message Bus backend / 后端服务
├── agent-runtime/  # Agent Runtime (Message Bus client) / 运行时节点
└── webui/          # React + TypeScript + Vite / 前端界面
```

## License / 许可证

Apache License 2.0
