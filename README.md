# Superco - AI Agent Distributed Scheduling Platform / AI Agent 分布式调度平台

[EN] Cross-platform AI Agent scheduling platform with Web UI terminal, Go backend, and cross-platform Agent Nodes.
[CN] 跨平台 AI Agent 分布式调度平台，提供 Web 终端界面、Go 后端服务和跨平台 Agent Node。

## Architecture

```
superco/
├── server/         # Go + Gin + WebSocket backend server
├── agent-node/     # Cross-platform Go binary (macOS/Linux/Windows)
└── webui/          # React + TypeScript + Vite + xterm.js
```

## Quick Start / 快速开始

### 1. Server / 启动后端

```bash
cd server
go run .
# Starts on :8080 / 启动于 :8080
```

> Requires PostgreSQL and Redis running locally.
> 需要本地运行 PostgreSQL 和 Redis。

### 2. Web UI / 启动前端

```bash
cd webui
npm install
npm run dev
# Opens on localhost:5173 / 启动于 localhost:5173
```

### 3. Agent Node / 启动节点

```bash
cd agent-node
go build -o agent-node .
./agent-node --server ws://localhost:8080/ws/node
```

## Cross-platform Build / 跨平台构建

```bash
make build-agent  # Builds for macOS (amd64+arm64), Linux, Windows
```

## Project Structure / 项目结构

```
superco/
├── server/         # Go + Gin + WebSocket backend server / 后端服务
├── agent-node/     # Cross-platform Go binary / 跨平台节点二进制
└── webui/          # React + TypeScript + Vite + xterm.js / 前端界面
```

## License / 许可证

Apache License 2.0
