# API Routes

Plugins can expose HTTP APIs externally through the host's reverse proxy.

## Routing Rules

On startup, the host reads the `api_routes` declarations from `plugin.json` and reverse-proxies matching requests to the plugin's HTTP server.

```
Client                        Host                             Plugin
  │                            │                              │
  │ GET /api/plugins/my-plugin/v1/widgets                    │
  │───────────────────────────→│                              │
  │                            │                              │
  │                            │  Proxy to plugin HTTP server  │
  │                            │  GET /v1/widgets             │
  │                            │  X-Plugin-Id: my-plugin     │
  │                            │─────────────────────────────→│
  │                            │                              │
  │                            │  Respond with JSON           │
  │                            │←─────────────────────────────│
  │◄───────────────────────────│                              │
```

## Route Prefix Declaration

In `plugin.json`:

```json
{
  "capabilities": {
    "api_routes": ["/api/plugins/my-plugin/*"]
  }
}
```

All requests starting with `/api/plugins/my-plugin/` will be proxied.

## Path Transformation

| Original Request Path | Plugin Receives |
|-------------|--------------|
| `/api/plugins/my-plugin/hello` | `/hello` |
| `/api/plugins/my-plugin/v1/widgets` | `/v1/widgets` |
| `/api/plugins/my-plugin/v1/widgets/123` | `/v1/widgets/123` |

The host strips the `/api/plugins/{name}` prefix before forwarding.

## Request Headers

The host injects the following headers when forwarding:

| Header | Value | Description |
|------|-----|------|
| `X-Plugin-Id` | `my-plugin` | Plugin identifier |
| `X-Forwarded-Host` | Original Host | Client's original Host |
| `X-User-Id` | `user-uuid` | Authenticated user ID (if global auth is enabled) |
| `X-Workspace-Id` | `workspace-uuid` | Current workspace ID |

## Response Conventions

Plugin APIs should return responses in the following format:

### Success Response

```json
{
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1
  }
}
```

### Pagination

| Parameter | Description |
|------|------|
| `?offset=0&limit=50` | Offset and limit |
| Default | `offset=0, limit=50` |

### Error Response

```json
{
  "error": {
    "code": "WIDGET_NOT_FOUND",
    "message": "Widget not found"
  }
}
```

The HTTP status code should reflect the error type (404, 400, 500, etc.).

### Standard HTTP Status Codes

| Status Code | Description | Use Case |
|--------|------|---------|
| 200 | Success | General response |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Parameter validation failed |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists |
| 422 | Unprocessable | Business logic error |
| 500 | Server Error | Internal error |

## Metadata Endpoints

Plugins can expose metadata endpoints to provide information for the admin interface:

| Endpoint | Method | Description |
|------|------|------|
| `/__plugin/about` | GET | Plugin runtime info |
| `/__plugin/status` | GET | Detailed runtime status |
| `/__plugin/config` | GET/POST | Runtime config read/write |

## Go Plugin Route Example

```go
package main

import (
    "encoding/json"
    "net/http"
)

func main() {
    mux := http.NewServeMux()
    
    // 生命周期（主程序调用）
    mux.HandleFunc("/__plugin/init", handleInit)
    mux.HandleFunc("/__plugin/health", handleHealth)
    
    // 业务 API
    mux.HandleFunc("/widgets", handleListWidgets)
    mux.HandleFunc("/widgets/create", handleCreateWidget)
    
    // ...启动服务器
}

func handleListWidgets(w http.ResponseWriter, r *http.Request) {
    // 客户端请求路径：/api/plugins/my-plugin/widgets
    // 插件收到的路径：/widgets
    widgets := []map[string]interface{}{
        {"id": "1", "name": "Widget A"},
        {"id": "2", "name": "Widget B"},
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "data":  widgets,
        "total": len(widgets),
    })
}
```

## Important Notes

1. **Route conflicts**: Plugin routes are isolated by the `/{name}/` prefix, so different plugins do not conflict with each other
2. **Path format**: Always use the `*` wildcard at the end to ensure all sub-paths are proxied
3. **HTTP only**: Plugins communicate with the host over HTTP. Go's standard `net/http` library is sufficient
4. **No WebSocket**: The current proxy does not support WebSocket upgrade
