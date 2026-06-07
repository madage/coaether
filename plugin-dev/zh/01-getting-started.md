# 快速开始

本文引导你从零创建一个 CoAether 插件。

## 环境要求

- Go 1.21+
- 任意 HTTP 框架（可用 Go 标准库 `net/http`）

## 步骤 1：创建项目目录

```
my-plugin/
├── plugin.json
├── main.go
└── go.mod
```

## 步骤 2：编写 plugin.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "extension",
  "label": {
    "zh": "我的插件",
    "en": "My Plugin"
  },
  "description": {
    "zh": "这是一个示例插件",
    "en": "This is an example plugin"
  },
  "author": "developer@example.com",
  "capabilities": {
    "http_port": 0,
    "hooks": [],
    "api_routes": ["/api/plugins/my-plugin/*"]
  },
  "permissions": [
    "task:read"
  ]
}
```

## 步骤 3：编写 main.go

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	// 读取环境变量（主程序注入）
	port := os.Getenv("COAETHER_PLUGIN_PORT")
	if port == "" {
		port = "0" // 0 = 随机端口
	}

	mux := http.NewServeMux()

	// 生命周期端点
	mux.HandleFunc("/__plugin/init", handleInit)
	mux.HandleFunc("/__plugin/health", handleHealth)
	mux.HandleFunc("/__plugin/hook", handleHook)
	mux.HandleFunc("/__plugin/shutdown", handleShutdown)

	// 业务 API
	mux.HandleFunc("/hello", handleHello)

	// 启动 HTTP 服务器（随机端口）
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	// ★ 向 stdout 输出 handshake JSON（主程序读取此信息确定端口）
	handshake := map[string]int{"port": listener.Addr().(*net.TCPAddr).Port}
	json.NewEncoder(os.Stdout).Encode(handshake)

	log.Printf("Plugin listening on port %d", listener.Addr().(*net.TCPAddr).Port)
	http.Serve(listener, mux)
}

func handleInit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PluginID  string `json:"plugin_id"`
		DataDir   string `json:"data_dir"`
		Config    string `json:"config"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	log.Printf("Init: plugin=%s dataDir=%s", req.PluginID, req.DataDir)
	w.WriteHeader(200)
	json.NewEncoder(w).Encode(map[string]bool{"ready": true})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]interface{}{
		"healthy":  true,
		"message":  "ok",
		"uptime_ms": 0,
	})
}

func handleHook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		HookName string            `json:"hook_name"`
		Context  map[string]string `json:"context"`
		Async    bool              `json:"async"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	log.Printf("Hook: %s", req.HookName)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"aborted": false,
	})
}

func handleShutdown(w http.ResponseWriter, r *http.Request) {
	log.Println("Shutting down...")
	w.WriteHeader(200)
	os.Exit(0)
}

func handleHello(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Hello from my-plugin!",
	})
}
```

## 步骤 4：编译

```bash
cd my-plugin
go build -o my-plugin .
```

## 步骤 5：安装到主程序

```bash
# 复制插件到主程序的 plugins 目录
cp my-plugin /path/to/coaether/plugins/my-plugin-1_0_0/
cp plugin.json /path/to/coaether/plugins/my-plugin-1_0_0/
```

目录结构：
```
plugins/
├── my-plugin-1_0_0/
│   ├── plugin.json
│   └── my-plugin
```

## 步骤 6：启动主程序

主程序启动时会自动扫描 `plugins/` 目录，发现并启动插件。

```bash
cd /path/to/coaether
./server
```

日志输出：
```
[PluginManager] Registered plugin: my-plugin@1.0.0
[PluginManager] Plugin started: my-plugin (pid=12345, port=54321)
```

## 验证插件运行

```bash
# 通过主程序代理访问插件 API
curl http://localhost:8080/api/plugins/my-plugin/hello

# 输出: {"message": "Hello from my-plugin!"}
```

## 文件结构速查

| 协议端点 | 方法 | 说明 |
|---------|------|------|
| `/__plugin/init` | POST | 主程序注入配置和数据目录 |
| `/__plugin/health` | GET | 健康检查（必须实现） |
| `/__plugin/hook` | POST | 接收钩子事件 |
| `/__plugin/shutdown` | POST | 优雅关闭 |
| `/{custom}` | ANY | 插件业务 API |

## 下一步

- [plugin.json 完整规范 →](02-manifest.md)
- [生命周期详解 →](03-lifecycle.md)
- [主机 API 参考 →](04-host-api.md)
