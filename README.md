# Superco - AI Agent 分布式调度平台

跨平台 AI Agent 分布式调度平台，提供 Web 聊天界面、多用户工作区、任务/项目管理。

## 架构

```
superco/
├── server/          # Go + Gin + WebSocket + Message Bus 后端
├── agent-runtime/   # Agent Runtime（通过 Message Bus 连接）
└── webui/           # React + TypeScript + Vite 前端
```

## 功能特性

- **多用户工作区** — 基于角色的权限体系（owner/admin/worker/observer）
- **AI Agent 聊天** — 浮动聊天窗口，支持多会话管理
- **Agent 配置** — 可自定义 Agent 名称、描述、运行时
- **任务管理** — 看板视图，支持状态流转（待办/进行中/阻塞/完成/审核）
- **项目管理** — 按项目组织任务
- **回收站** — 软删除，可恢复
- **工作区邀请** — 邮箱邀请 + 站内通知 + WebSocket 实时推送
- **多语言** — 中文 / English
- **用户管理** — 管理员可查看/删除用户

## 快速开始

### 1. 依赖

- Go 1.21+
- Node.js 18+
- PostgreSQL

### 2. 配置

```bash
cp .env.example .env
# 编辑 .env，填写 POSTGRES_DSN、JWT_SECRET 等
```

### 3. 启动后端

```bash
cd server
go run .
# 监听 :8088
```

首次启动自动执行数据库迁移。

### 4. 启动前端

```bash
cd webui
npm install
npm run dev
# 打开 localhost:5173
```

### 5. 启动 Agent Runtime

```bash
cd agent-runtime
go build -o agent-runtime .
./agent-runtime
# 自动连接 ws://localhost:8088/ws/bus
```

> 需要 `claude` CLI 在 PATH 中，或配置其他 AI 工具。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `POSTGRES_DSN` | PostgreSQL 连接字符串 | `postgres://postgres:postgres@localhost:5432/superco?sslmode=disable` |
| `JWT_SECRET` | JWT 签名密钥 | `superco-secret-key` |
| `SMTP_HOST` | SMTP 服务器（可选，用于邮件邀请） | - |
| `SMTP_PORT` | SMTP 端口 | `587` |
| `SMTP_USER` | SMTP 用户名 | - |
| `SMTP_PASS` | SMTP 密码 | - |
| `SMTP_FROM` | 发件人地址 | - |
| `PORT` | 服务端口 | `8088` |

## 技术栈

- **后端**: Go, Gin, gorilla/websocket, PostgreSQL, JWT (golang-jwt)
- **前端**: React 18, TypeScript, Vite
- **通信**: REST API + WebSocket（Dashboard 总线 + Message Bus）
- **AI 运行时**: 通过 Message Bus 协议连接 Agent Runtime
