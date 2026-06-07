# CoAether 插件开发指南

## 概述

CoAether 插件系统允许开发者通过独立子进程扩展平台能力。插件以二进制形式运行，通过 HTTP 与主程序通信。

### 插件核心概念

| 概念 | 说明 |
|------|------|
| **子进程模型** | 插件作为独立进程运行，与主程序隔离。崩溃不影响主程序 |
| **HTTP 通信** | 主程序通过反向代理将 API 请求转发到插件的 HTTP 服务器 |
| **插件清单** | 每个插件通过 `plugin.json` 声明元数据、能力、权限 |
| **前端插槽** | 插件可注册 React 组件到主程序 UI 的命名插槽中 |
| **钩子系统** | 插件监听主程序事件（任务创建、状态变更等）并做出响应 |
| **主机 API** | 插件通过标准 HTTP API 回调主程序，访问数据和功能 |

### 文档结构

```
plugin-dev/
├── README.md                       ← 你现在在这里
├── 01-getting-started.md           ← 快速开始
├── 02-manifest.md                  ← plugin.json 清单规范
├── 03-lifecycle.md                 ← 生命周期协议
├── 04-host-api.md                  ← 主机 API 参考
├── 05-hooks.md                     ← 钩子系统
├── 06-api-routes.md                ← API 路由
├── 07-frontend-slots.md            ← 前端插槽
├── 08-database.md                  ← 数据库与 KV 存储
├── 09-message-bus.md               ← 消息总线
├── 10-permissions.md               ← 权限系统
├── 11-extending.md                 ← 扩展主机 API
├── examples/                       ← 示例插件
│   ├── hello-world/                ← 最小示例
│   └── task-annotator/             ← 完整功能示例
└── reference/                      ← 技术参考
    ├── changelog.md                ← 协议版本变更
    └── plugin-host-api-spec.json   ← 主机 API OpenAPI 规范
```

### 快速链接

- [快速开始 →](01-getting-started.md)
- [plugin.json 规范 →](02-manifest.md)
- [扩展主机 API →](11-extending.md)
- [Hello World 示例 →](examples/hello-world/README.md)
