# Permission System

## Overview

Plugins declaratively list required permissions in `plugin.json`. The host checks permissions at installation and runtime.

## Declaring Permissions

```json
{
  "permissions": [
    "task:read",
    "task:write",
    "project:read",
    "workspace:read"
  ]
}
```

Principle: **Least Privilege** — only declare the permissions your plugin actually needs.

## Complete Permission List

### Tasks

| Permission | Corresponding Host API | Description |
|------|---------------|------|
| `task:read` | `GET /tasks` | Read task list and details |
| `task:write` | `POST /tasks`, `PUT /tasks/:id`, `DELETE /tasks/:id` | Create, update, delete tasks |

### Projects

| Permission | Corresponding Host API | Description |
|------|---------------|------|
| `project:read` | `GET /projects` | Read project list |
| `project:write` | - | Create, update, delete projects |

### Workspace

| Permission | Description |
|------|------|
| `workspace:read` | Read workspace info and members |
| `workspace:write` | Manage workspace settings |

### Users

| Permission | Description |
|------|------|
| `user:read` | Read basic user information |

### AI Agents

| Permission | Description |
|------|------|
| `agent:execute` | Invoke AI agents |
| `agent:manage` | Manage agent configuration |

### Webhook

| Permission | Description |
|------|------|
| `webhook:read` | Read webhook configurations |
| `webhook:write` | Create and modify webhooks |

### Comments

| Permission | Description |
|------|------|
| `comment:read` | Read comments |
| `comment:write` | Create and delete comments |

### Admin

| Permission | Description |
|------|------|
| `admin:config` | Read and write global system configuration |
| `admin:plugins` | Manage other plugins (start/stop/uninstall) |

## Permission Check Methods

### 1. Declaration Check on Install

The `permissions` field in `plugin.json` is validated by the host on load. Unknown permission strings are rejected.

### 2. Runtime Check

Plugins can call the host API to check whether an operation has permission:

```
GET /__plugin_host/permission?perm=task:write
X-Plugin-Id: my-plugin

→ {"allowed": true}
```

### 3. Automatic Server-Side Check

The host API automatically verifies permissions when processing requests. If the plugin does not have the required permission, the request is rejected:

```
POST /__plugin_host/tasks
X-Plugin-Id: my-plugin
(but my-plugin has not declared task:write)

→ 403 {"allowed": false}
```

## Go Permission Check Example

```go
func checkPermission(perm string) bool {
    hostAddr := os.Getenv("COAETHER_HOST_ADDR")
    pluginID := os.Getenv("COAETHER_PLUGIN_ID")

    url := fmt.Sprintf("http://%s/__plugin_host/permission?perm=%s", hostAddr, perm)
    req, _ := http.NewRequest("GET", url, nil)
    req.Header.Set("X-Plugin-Id", pluginID)

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return false
    }
    defer resp.Body.Close()

    var result struct {
        Allowed bool `json:"allowed"`
    }
    json.NewDecoder(resp.Body).Decode(&result)
    return result.Allowed
}

// Usage example
if !checkPermission("task:write") {
    http.Error(w, "Permission denied", http.StatusForbidden)
    return
}
```
