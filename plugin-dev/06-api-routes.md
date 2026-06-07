# API 路由

插件可以通过主程序的反向代理对外暴露 HTTP API。

## 路由规则

主程序启动时根据 `plugin.json` 中的 `api_routes` 声明，将匹配的请求反向代理到插件的 HTTP 服务器。

```
Client                       主程序                          插件
  │                            │                              │
  │ GET /api/plugins/my-plugin/v1/widgets                    │
  │───────────────────────────→│                              │
  │                            │                              │
  │                            │  代理到插件 HTTP 服务器       │
  │                            │  GET /v1/widgets             │
  │                            │  X-Plugin-Id: my-plugin     │
  │                            │─────────────────────────────→│
  │                            │                              │
  │                            │  响应 JSON                   │
  │                            │←─────────────────────────────│
  │◄───────────────────────────│                              │
```

## 路由前缀声明

在 `plugin.json` 中：

```json
{
  "capabilities": {
    "api_routes": ["/api/plugins/my-plugin/*"]
  }
}
```

所有以 `/api/plugins/my-plugin/` 开头的请求都会被代理。

## 路径转换

| 原始请求路径 | 插件收到的路径 |
|-------------|--------------|
| `/api/plugins/my-plugin/hello` | `/hello` |
| `/api/plugins/my-plugin/v1/widgets` | `/v1/widgets` |
| `/api/plugins/my-plugin/v1/widgets/123` | `/v1/widgets/123` |

主程序移除 `/api/plugins/{name}` 前缀后转发。

## 请求头

主程序在转发时注入以下头部：

| 头部 | 值 | 说明 |
|------|-----|------|
| `X-Plugin-Id` | `my-plugin` | 插件标识 |
| `X-Forwarded-Host` | 原始 Host | 客户端原始 Host |
| `X-User-Id` | `user-uuid` | 认证用户 ID（如果启用了全局认证） |
| `X-Workspace-Id` | `workspace-uuid` | 当前工作区 ID |

## 响应规范

插件 API 应按以下格式返回响应：

### 成功响应

```json
{
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1
  }
}
```

### 分页

| 参数 | 说明 |
|------|------|
| `?offset=0&limit=50` | 偏移量和限制数 |
| 默认 | `offset=0, limit=50` |

### 错误响应

```json
{
  "error": {
    "code": "WIDGET_NOT_FOUND",
    "message": "Widget not found"
  }
}
```

HTTP 状态码应反映错误类型（404、400、500 等）。

### 标准 HTTP 状态码

| 状态码 | 说明 | 使用场景 |
|--------|------|---------|
| 200 | 成功 | 常规响应 |
| 201 | 已创建 | 资源创建成功 |
| 400 | 请求错误 | 参数校验失败 |
| 404 | 未找到 | 资源不存在 |
| 409 | 冲突 | 资源已存在 |
| 422 | 不可处理 | 业务逻辑错误 |
| 500 | 服务器错误 | 内部错误 |

## 元数据端点

插件可以暴露元数据端点为管理界面提供信息：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/__plugin/about` | GET | 插件运行时信息 |
| `/__plugin/status` | GET | 详细运行状态 |
| `/__plugin/config` | GET/POST | 运行时配置读写 |

## Go 插件路由示例

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

## 注意事项

1. **路由冲突**：插件路由通过前缀 `/{name}/` 隔离，不同插件不会冲突
2. **路径格式**：始终在末尾使用 `*` 通配符，确保所有子路径被代理
3. **仅 HTTP**：插件与主程序通过 HTTP 通信。Go 标准库 `net/http` 即可
4. **无 WebSocket**：当前代理不支持 WebSocket 升级
