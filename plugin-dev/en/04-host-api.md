# Host API

Plugins access data and functionality by calling the `__plugin_host` HTTP endpoints on the host server. These endpoints are internal interfaces of the host and are only accessible from localhost.

## How to Call

Plugins identify themselves via the `X-Plugin-Id` header, and the host enforces access control based on the permissions declared by the plugin.

```go
// Calling the host API from a Go plugin
func callHost(path, method string, body interface{}) ([]byte, error) {
    hostAddr := os.Getenv("COAETHER_HOST_ADDR")
    // hostAddr format: "127.0.0.1:8080"
    
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

## Task API

### GET /__plugin_host/tasks

Query the task list.

**Query Parameters:**
| Parameter | Type | Required | Description |
|------|------|------|------|
| `project_id` | string | No | Filter by project |
| `status` | string | No | Filter by status |
| `assignee_id` | string | No | Filter by assignee |

**Response:**
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

**Required Permission:** `task:read`

---

### POST /__plugin_host/tasks

Create a task.

**Request Body:**
```json
{
  "title": "任务标题",
  "description": "任务描述",
  "project_id": "project-uuid",
  "status": "todo"
}
```

**Response:**
```json
{
  "id": "new-uuid",
  "title": "任务标题",
  "status": "todo"
}
```

**Required Permission:** `task:write`

---

### PUT /__plugin_host/tasks/:id

Update task fields.

**Request Body:** Any key-value pairs
```json
{
  "title": "新标题",
  "status": "in_progress"
}
```

**Response:**
```json
{
  "updated": true,
  "id": "task-uuid"
}
```

**Required Permission:** `task:write`

---

### DELETE /__plugin_host/tasks/:id

Soft delete a task.

**Response:**
```json
{"deleted": true}
```

**Required Permission:** `task:write`

## Project API

### GET /__plugin_host/projects

Query all projects.

**Response:**
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

**Required Permission:** `project:read`

## Message Bus

### POST /__plugin_host/message

Send a message to the message bus.

```json
{
  "to": "broadcast",
  "type": "my_plugin:event.something_happened",
  "payload": {"key": "value"}
}
```

| Field | Type | Description |
|------|------|------|
| `to` | string | Target endpoint (`broadcast`, `session://xxx`, `agent://xxx`) |
| `type` | string | Message type, must begin with `plugin.{name}:` |
| `payload` | object | Message payload |

**Required Permission:** None (but message type must follow naming convention)

## Permission Check

### GET /__plugin_host/permission

Check whether the plugin has a specific permission.

**Query Parameters:**
| Parameter | Description |
|------|------|
| `perm` | The permission string to check, e.g., `task:write` |

**Response:**
```json
{"allowed": true}
```

## Logging

### POST /__plugin_host/log

Write structured logs to the host's logging system.

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

| Level | Description |
|-------------|------|
| `debug` | Debug |
| `info` | General info |
| `warn` | Warning |
| `error` | Error |

Output format:
```
[Plugin:my-plugin][INFO] 处理任务完成 map[task_id:xxx duration_ms:150]
```

## KV Store

Plugin-level key-value store, data is kept in memory (production plugins should use file persistence instead).

### GET /__plugin_host/kv/{key}

Read a value.

- Success: 200, response body is raw bytes
- Not found: 404

### POST /__plugin_host/kv/{key}

Write a value. The request body is raw bytes.

**Response:** `{"saved": true}`

### DELETE /__plugin_host/kv/{key}

Delete a key.

**Response:** `{"deleted": true}`

**Note:** The KV store currently uses an in-memory implementation; data is lost on restart. Production plugins should use SQLite or migration scripts to create their own tables.

## Required Permission Reference

| Endpoint | Required Permission |
|------|---------|
| `GET /tasks` | `task:read` |
| `POST /tasks` | `task:write` |
| `PUT /tasks/:id` | `task:write` |
| `DELETE /tasks/:id` | `task:write` |
| `GET /projects` | `project:read` |
| `POST /message` | None |
| `GET /permission` | None |
| `POST /log` | None |
| `GET/POST/DELETE /kv/*` | None |
