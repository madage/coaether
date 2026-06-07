# 插件协议版本变更

记录插件系统通信协议和历史标准变更。

## v1 (当前)

初始版本。

### 协议基线

| 项目 | 值 |
|------|-----|
| 通信方式 | HTTP 1.1 |
| 数据格式 | JSON (Content-Type: application/json) |
| 插件类型 | 子进程（独立二进制） |
| 端口分配 | 随机端口（`http_port: 0`），通过 stdout handshake 报告 |
| 认证方式 | X-Plugin-Id 头部 |
| 生命周期端点 | /__plugin/init, /__plugin/health, /__plugin/hook, /__plugin/shutdown |

### 端点版本

| 端点 | 版本 | 变更历史 |
|------|------|---------|
| GET /__plugin/health | v1 | 初始 |
| POST /__plugin/init | v1 | 初始 |
| POST /__plugin/hook | v1 | 初始 |
| POST /__plugin/shutdown | v1 | 初始 |
| GET /__plugin_host/tasks | v1 | 初始 |
| POST /__plugin_host/tasks | v1 | 初始 |
| PUT /__plugin_host/tasks/:id | v1 | 初始 |
| DELETE /__plugin_host/tasks/:id | v1 | 初始 |
| GET /__plugin_host/projects | v1 | 初始 |
| POST /__plugin_host/message | v1 | 初始 |
| GET /__plugin_host/permission | v1 | 初始 |
| POST /__plugin_host/log | v1 | 初始 |
| GET /__plugin_host/kv/:key | v1 | 初始 |
| POST /__plugin_host/kv/:key | v1 | 初始 |
| DELETE /__plugin_host/kv/:key | v1 | 初始 |

### 计划中的变更

以下变更在讨论中，尚未实施：

| 提案 | 影响 | 预计版本 |
|------|------|---------|
| gRPC 支持 | 新增通信方式，不使用 HTTP | v2 |
| 插件市场 | 新增分发和版本管理 | v2 |
| 定时任务 OnTick | 新增生命周期端点 | v2 |
| 消息总线 OnMessage | 新增钩子事件 | v2 |
| 插件配置 UI | 新增管理界面配置页面 | v2 |
| 文件存储 API | 新增 FileStore 上传/下载 | v2 |
