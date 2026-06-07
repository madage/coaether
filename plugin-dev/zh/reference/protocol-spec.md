# 插件通信协议规范

## 概述

插件与主程序之间的通信基于 HTTP 1.1 JSON 协议。本文档是协议层面的精确规范。

## 传输

- **传输层**：TCP
- **应用层**：HTTP 1.1
- **默认端口**：动态分配（随机可用端口）
- **编码**：UTF-8
- **Content-Type**：`application/json`（生命周期端点）；自定义（业务端点）

## Handshake 协议

插件启动后必须在 30 秒内向 stdout 写入一行 JSON：

```
{"port": 54321}\n
```

- 仅第一行 stdout 被解析为 handshake
- 后续 stdout 内容被主程序捕获并作为日志输出
- stderr 内容始终被转发到主程序日志

## 生命周期端点协议

### POST /__plugin/init

**请求：**
```
POST /__plugin/init HTTP/1.1
Content-Type: application/json

{
  "plugin_id": "my-plugin",
  "workspace_id": "",
  "data_dir": "/data/plugins/my-plugin",
  "config": "{\"key\": \"value\"}"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| plugin_id | string | 插件标识（与 manifest name 一致） |
| workspace_id | string | 当前工作区 ID |
| data_dir | string | 插件写入数据文件的目录 |
| config | string | JSON 字符串形式的配置 |

**响应：**
```
HTTP/1.1 200 OK
Content-Type: application/json

{"ready": true}
```

- `ready: true` = 初始化成功
- 非 200 状态码 = 初始化失败，插件将被终止

### GET /__plugin/health

**请求：**
```
GET /__plugin/health HTTP/1.1
```

**响应：**
```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "healthy": true,
  "message": "ok",
  "uptime_ms": 123456
}
```

- `healthy`：bool，必须为 true 表示健康
- `message`：可读状态信息
- 超时：5 秒

### POST /__plugin/hook

**请求：**
```
POST /__plugin/hook HTTP/1.1
Content-Type: application/json

{
  "hook_name": "task:created",
  "context": {"task_id": "uuid"},
  "async": false
}
```

**响应：**
```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "aborted": false,
  "error_message": "",
  "mutated_context": {}
}
```

- `aborted`: 仅同步钩子有效，true 表示中断后续操作
- 超时：5 秒

### POST /__plugin/shutdown

**请求：**
```
POST /__plugin/shutdown HTTP/1.1
Content-Type: application/json

{"reason": "manager_stop"}
```

**响应：**
```
HTTP/1.1 200 OK
```

- 插件应在收到此请求后 10 秒内退出
- 超时后主程序发送 SIGKILL（Unix）或 TerminateProcess（Windows）

## 主机 API 协议

### 请求

```
{method} /__plugin_host/{path} HTTP/1.1
Host: 127.0.0.1:{port}
X-Plugin-Id: my-plugin
Content-Type: application/json
```

### 响应

**成功：**
```
HTTP/1.1 200 OK
Content-Type: application/json

{"tasks": [...]}
```

**权限不足：**
```
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"allowed": false}
```

**错误：**
```
HTTP/1.1 4xx/5xx
Content-Type: application/json

{"error": "描述信息"}
```

## 反向代理协议

### 请求转发

```
Client → 主程序 → 插件
```

主程序收到 `/api/plugins/{name}/{path}` 后：

1. 提取 `{name}` → 查找运行中的插件实例
2. 移除 `/api/plugins/{name}` 前缀
3. 转发 `/{path}` 到插件的 HTTP 服务器
4. 注入头部：`X-Plugin-Id`, `X-Forwarded-Host`

### 响应转发

插件 → 主程序 → Client

主程序原样返回插件的 HTTP 响应（状态码、头部、body）。

## 错误处理

| 场景 | 插件行为 | 主程序行为 |
|------|---------|-----------|
| Init 失败 | 返回非 200 | 杀死进程，标记 Error |
| Health 超时 | — | 标记 Error，不重启 |
| Hook 超时 | — | 跳过该插件，继续后续流程 |
| 进程崩溃 | — | 标记 Stopped |
| 非法响应 | — | 忽略，记录警告 |
