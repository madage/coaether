# 钩子系统

钩子允许插件监听主程序事件并做出响应。

## 工作原理

```
主程序事件发生
     │
     ▼
HookManager 检查哪些插件注册了该钩子
     │
     ├──→ Plugin A: POST /__plugin/hook (同步, 5s 超时)
     │       └── 返回 {aborted: false}
     │
     ├──→ Plugin B: POST /__plugin/hook (同步, 5s 超时)
     │       └── 返回 {aborted: true, error_message: "验证失败"}
     │       └── ★ 中断后续流程
     │
     └──→ Plugin C: 异步钩子, goroutine 触发
             └── 不阻塞主流程
```

## 声明钩子

在 `plugin.json` 的 `capabilities.hooks` 中声明：

```json
{
  "capabilities": {
    "hooks": ["task:created", "task:updated", "task:status_changed"]
  }
}
```

## 处理钩子事件

钩子事件通过 `POST /__plugin/hook` 发送到插件：

**请求体：**
```json
{
  "hook_name": "task:created",
  "context": {
    "task_id": "uuid",
    "project_id": "uuid",
    "creator_id": "uuid"
  },
  "async": false
}
```

**响应体：**
```json
{
  "aborted": false,
  "error_message": "",
  "mutated_context": {}
}
```

### 响应字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `aborted` | bool | 是否中断后续操作（仅同步钩子有效） |
| `error_message` | string | 中断原因，aborted=true 时必填 |
| `mutated_context` | object | 修改后的上下文数据（被后续步骤使用） |

## 同步 vs 异步

| 模式 | 说明 | 超时 |
|------|------|------|
| 同步 | 按注册顺序依次调用，任一插件返回 `aborted=true` 则中断 | 5s |
| 异步 | 并发通知所有注册插件（goroutine），不阻塞主流程 | 5s |

## 预定义钩子

### 应用生命周期

| 钩子名称 | 模式 | 触发时机 |
|---------|------|---------|
| `app:ready` | 异步 | 主程序启动完成 |
| `app:shutdown` | 同步 | 主程序即将关闭 |

### 任务事件

| 钩子名称 | 模式 | context 字段 | 说明 |
|---------|------|-------------|------|
| `task:created` | 同步 | task_id, project_id, creator_id | 任务创建后 |
| `task:updated` | 同步 | task_id, changed_fields | 任务更新后 |
| `task:deleted` | 异步 | task_id | 任务删除后 |
| `task:status_changed` | 同步 | task_id, from_status, to_status | 任务状态变更 |
| `task:assigned` | 异步 | task_id, assignee_id, assignee_type | 负责人变更 |

### 项目事件

| 钩子名称 | 模式 | context 字段 |
|---------|------|-------------|
| `project:created` | 同步 | project_id, creator_id |
| `project:updated` | 同步 | project_id |
| `project:deleted` | 异步 | project_id |

### 其他

| 钩子名称 | 模式 | context 字段 |
|---------|------|-------------|
| `comment:created` | 同步 | comment_id, task_id, user_id |
| `plugin:started` | 异步 | plugin_id, version |
| `plugin:stopped` | 异步 | plugin_id, reason |

## Go 插件处理钩子的最佳实践

```go
func handleHook(w http.ResponseWriter, r *http.Request) {
    var req struct {
        HookName string            `json:"hook_name"`
        Context  map[string]string `json:"context"`
        Async    bool              `json:"async"`
    }
    json.NewDecoder(r.Body).Decode(&req)

    var resp struct {
        Aborted      bool              `json:"aborted"`
        ErrorMessage string            `json:"error_message,omitempty"`
        MutatedCtx   map[string]string `json:"mutated_context,omitempty"`
    }

    switch req.HookName {
    case "task:created":
        taskID := req.Context["task_id"]
        // 处理任务创建事件
        if req.Async {
            go handleTaskCreated(taskID)
            resp.Aborted = false
        } else {
            resp.Aborted = false
        }

    case "app:shutdown":
        // 清理资源
        cleanup()

    default:
        resp.Aborted = false
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(resp)
}
```

## 注意事项

1. **所有插件必须实现 /__plugin/hook**，即使没有声明 hooks。不返回 200 可能导致主程序误认为插件异常
2. **同步钩子中超时必须尽快返回**。超时后主程序会跳过该插件继续执行
3. **异步钩子中不要阻塞**。如果处理耗时，使用 goroutine 异步执行
4. **不要在钩子中修改数据库中的主程序数据**，应使用主机 API 进行受控的写入
