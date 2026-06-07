# Hook System

Hooks allow plugins to listen for host events and respond.

## How It Works

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

## Declaring Hooks

Declare them in `capabilities.hooks` in `plugin.json`:

```json
{
  "capabilities": {
    "hooks": ["task:created", "task:updated", "task:status_changed"]
  }
}
```

## Handling Hook Events

Hook events are sent to the plugin via `POST /__plugin/hook`:

**Request Body:**
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

**Response Body:**
```json
{
  "aborted": false,
  "error_message": "",
  "mutated_context": {}
}
```

### Response Fields

| Field | Type | Description |
|------|------|------|
| `aborted` | bool | Whether to abort subsequent operations (only valid for sync hooks) |
| `error_message` | string | Reason for abort, required when aborted=true |
| `mutated_context` | object | Mutated context data (consumed by subsequent steps) |

## Sync vs Async

| Mode | Description | Timeout |
|------|------|------|
| Sync | Called sequentially in registration order; any plugin returning `aborted=true` aborts the chain | 5s |
| Async | Concurrently notifies all registered plugins (via goroutine), does not block the main flow | 5s |

## Predefined Hooks

### Application Lifecycle

| Hook Name | Mode | Trigger |
|---------|------|---------|
| `app:ready` | Async | Host startup complete |
| `app:shutdown` | Sync | Host is about to shut down |

### Task Events

| Hook Name | Mode | Context Fields | Description |
|---------|------|-------------|------|
| `task:created` | Sync | task_id, project_id, creator_id | After task creation |
| `task:updated` | Sync | task_id, changed_fields | After task update |
| `task:deleted` | Async | task_id | After task deletion |
| `task:status_changed` | Sync | task_id, from_status, to_status | Task status changed |
| `task:assigned` | Async | task_id, assignee_id, assignee_type | Assignee changed |

### Project Events

| Hook Name | Mode | Context Fields |
|---------|------|-------------|
| `project:created` | Sync | project_id, creator_id |
| `project:updated` | Sync | project_id |
| `project:deleted` | Async | project_id |

### Other

| Hook Name | Mode | Context Fields |
|---------|------|-------------|
| `comment:created` | Sync | comment_id, task_id, user_id |
| `plugin:started` | Async | plugin_id, version |
| `plugin:stopped` | Async | plugin_id, reason |

## Best Practices for Handling Hooks in Go Plugins

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

## Important Notes

1. **All plugins must implement /__plugin/hook**, even if they haven't declared any hooks. Not returning 200 may cause the host to consider the plugin abnormal
2. **In sync hooks, return quickly on timeout**. After a timeout, the host skips the plugin and continues execution
3. **Do not block in async hooks**. If processing is time-consuming, execute it asynchronously using a goroutine
4. **Do not modify host data in the database from hooks**; use the host API for controlled writes instead
