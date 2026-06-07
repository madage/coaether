# 主机 API

插件通过调用主服务器的 `__plugin_host` HTTP 端点来访问数据和功能。这些端点是主程序内部接口，仅限 localhost 访问。

## 调用方式

插件通过 `X-Plugin-Id` 头部标识身份，主程序根据插件声明的权限进行访问控制。

```go
// 在 Go 插件中调用主机 API
func callHost(path, method string, body interface{}) ([]byte, error) {
    hostAddr := os.Getenv("COAETHER_HOST_ADDR")
    // hostAddr 格式: "127.0.0.1:8080"
    
    url := fmt.Sprintf("http://%s/__plugin_host%s", hostAddr, path)
    
    var buf bytes.Buffer
    json.NewEncoder(&buf).Encode(body)
    
    req, _ := http.NewRequest(method, url, &buf)
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-Plugin-Id", os.Getenv("COAETHER_PLUGIN_ID"))
    
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    return io.ReadAll(resp.Body)
}
```

## 任务 API

### GET /__plugin_host/tasks

查询任务列表。

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project_id` | string | 否 | 按项目筛选 |
| `status` | string | 否 | 按状态筛选 |
| `assignee_id` | string | 否 | 按负责人筛选 |

**响应：**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "user_id": "creator-id",
      "title": "任务标题",
      "description": "任务描述",
      "status": "todo",
      "project_id": "project-uuid",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

**所需权限：** `task:read`

---

### POST /__plugin_host/tasks

创建任务。

**请求体：**
```json
{
  "title": "任务标题",
  "description": "任务描述",
  "project_id": "project-uuid",
  "status": "todo"
}
```

**响应：**
```json
{
  "id": "new-uuid",
  "title": "任务标题",
  "status": "todo"
}
```

**所需权限：** `task:write`

---

### PUT /__plugin_host/tasks/:id

更新任务字段。

**请求体：** 任意键值对
```json
{
  "title": "新标题",
  "status": "in_progress"
}
```

**响应：**
```json
{
  "updated": true,
  "id": "task-uuid"
}
```

**所需权限：** `task:write`

---

### DELETE /__plugin_host/tasks/:id

软删除任务。

**响应：**
```json
{"deleted": true}
```

**所需权限：** `task:write`

## 项目 API

### GET /__plugin_host/projects

查询所有项目。

**响应：**
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "项目名",
      "description": "描述",
      "color": "#1976d2",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

**所需权限：** `project:read`

## 消息总线

### POST /__plugin_host/message

向消息总线发送消息。

```json
{
  "to": "broadcast",
  "type": "my_plugin:event.something_happened",
  "payload": {"key": "value"}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `to` | string | 目标端点（`broadcast`、`session://xxx`、`agent://xxx`） |
| `type` | string | 消息类型，必须以 `plugin.{name}:` 开头 |
| `payload` | object | 消息内容 |

**所需权限：** 无（但消息类型必须符合命名约定）

## 权限检查

### GET /__plugin_host/permission

检查插件是否有指定权限。

**查询参数：**
| 参数 | 说明 |
|------|------|
| `perm` | 要检查的权限字符串，如 `task:write` |

**响应：**
```json
{"allowed": true}
```

## 日志

### POST /__plugin_host/log

向主程序日志系统写入结构化日志。

```json
{
  "level": "info",
  "message": "处理任务完成",
  "fields": {
    "task_id": "xxx",
    "duration_ms": "150"
  }
}
```

| level 可选值 | 说明 |
|-------------|------|
| `debug` | 调试信息 |
| `info` | 一般信息 |
| `warn` | 警告 |
| `error` | 错误 |

输出格式：
```
[Plugin:my-plugin][INFO] 处理任务完成 map[task_id:xxx duration_ms:150]
```

## KV 存储

插件级别的键值存储，数据保存在内存中（生产环境应改用文件持久化）。

### GET /__plugin_host/kv/{key}

读取值。

- 成功：200，响应体为原始字节
- 未找到：404

### POST /__plugin_host/kv/{key}

写入值。请求体为原始字节。

**响应：** `{"saved": true}`

### DELETE /__plugin_host/kv/{key}

删除键。

**响应：** `{"deleted": true}`

**注意：** KV 存储当前是内存实现，重启后数据丢失。生产插件应使用 SQLite 或迁移脚本创建自己的数据表。

## 所需权限速查表

| 端点 | 所需权限 |
|------|---------|
| `GET /tasks` | `task:read` |
| `POST /tasks` | `task:write` |
| `PUT /tasks/:id` | `task:write` |
| `DELETE /tasks/:id` | `task:write` |
| `GET /projects` | `project:read` |
| `POST /message` | 无 |
| `GET /permission` | 无 |
| `POST /log` | 无 |
| `GET/POST/DELETE /kv/*` | 无 |
