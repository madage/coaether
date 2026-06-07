# Quick Start

This guide walks you through creating a CoAether plugin from scratch.

## Prerequisites

- Go 1.21+
- Any HTTP framework (Go standard library `net/http` works)

## Step 1: Create the Project Directory

```
my-plugin/
├── plugin.json
├── main.go
└── go.mod
```

## Step 2: Write plugin.json

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

## Step 3: Write main.go

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
	// Read environment variable (injected by host)
	port := os.Getenv("COAETHER_PLUGIN_PORT")
	if port == "" {
		port = "0" // 0 = random port
	}

	mux := http.NewServeMux()

	// Lifecycle endpoints
	mux.HandleFunc("/__plugin/init", handleInit)
	mux.HandleFunc("/__plugin/health", handleHealth)
	mux.HandleFunc("/__plugin/hook", handleHook)
	mux.HandleFunc("/__plugin/shutdown", handleShutdown)

	// Business API
	mux.HandleFunc("/hello", handleHello)

	// Start HTTP server (random port)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	// ★ Output handshake JSON to stdout (host reads this to determine the port)
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
		"healthy":   true,
		"message":   "ok",
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

## Step 4: Build

```bash
cd my-plugin
go build -o my-plugin .
```

## Step 5: Install into the Host

```bash
# Copy plugin to the host's plugins directory
cp my-plugin /path/to/coaether/plugins/my-plugin-1_0_0/
cp plugin.json /path/to/coaether/plugins/my-plugin-1_0_0/
```

Directory structure:
```
plugins/
├── my-plugin-1_0_0/
│   ├── plugin.json
│   └── my-plugin
```

## Step 6: Start the Host

When the host starts, it automatically scans the `plugins/` directory, discovers and starts plugins.

```bash
cd /path/to/coaether
./server
```

Log output:
```
[PluginManager] Registered plugin: my-plugin@1.0.0
[PluginManager] Plugin started: my-plugin (pid=12345, port=54321)
```

## Verify Plugin is Running

```bash
# Access the plugin API through the host proxy
curl http://localhost:8080/api/plugins/my-plugin/hello

# Output: {"message": "Hello from my-plugin!"}
```

## File Structure Quick Reference

| Protocol Endpoint | Method | Description |
|-------------------|--------|-------------|
| `/__plugin/init` | POST | Host injects configuration and data directory |
| `/__plugin/health` | GET | Health check (required) |
| `/__plugin/hook` | POST | Receive hook events |
| `/__plugin/shutdown` | POST | Graceful shutdown |
| `/{custom}` | ANY | Plugin business API |

## Next Steps

- [plugin.json Full Specification →](02-manifest.md)
- [Lifecycle Details →](03-lifecycle.md)
- [Host API Reference →](04-host-api.md)
