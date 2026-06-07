# Plugin Lifecycle

## State Machine

```
┌──────────┐
│Scanned   │  plugin.json discovered in plugins/ directory
└────┬─────┘
     ↓
┌──────────┐
│Registered│  Manifest validated, registered with the manager
└────┬─────┘
     ↓
┌──────────┐
│Starting  │  Subprocess starting, waiting for handshake
└────┬─────┘
     ↓
┌──────────┐
│Running   │  Handshake complete, Init successful
└────┬─────┘
     ↓
┌──────────┐
│Stopping  │  Stop signal received, calling shutdown
└────┬─────┘
     ↓
┌──────────┐
│Stopped   │  Process has exited
└──────────┘

Error paths:
Running ─→ Error  Health check failed or process crashed
Starting ─→ Error Handshake timed out or Init failed
```

## Stage Details

### 1. Discover

When the host starts, it scans all subdirectories under `plugins/` for `plugin.json`.

```go
// Host internal logic
pluginMgr := plugin.NewManager(".", ".")
loaded, _ := pluginMgr.LoadAndRegister()
// loaded = ["my-plugin", "another-plugin"]
```

### 2. Register

After validating `plugin.json`, the plugin is added to the manager. The plugin is not yet started at this point.

### 3. Start

```
PluginManager                  Plugin Subprocess
    │                            │
    │  Start binary              │
    │───────────────────────────→│
    │                            │  ├ Initialize internal state
    │                            │  ├ Start HTTP server
    │                            │  └ Write to stdout:
    │                            │    {"port": 54321}
    │◄───────────────────────────│
    │                            │
    │  POST /__plugin/init       │
    │  {plugin_id, data_dir,     │
    │   config, workspace_id}    │
    │───────────────────────────→│
    │  {"ready": true}           │
    │◄───────────────────────────│
    │                            │
    │  Status → Running          │
```

#### Handshake Protocol

After starting, the plugin must output a single line of JSON to stdout within **30 seconds**:

```json
{"port": 54321}
```

- `port`: The port number of the plugin's HTTP server (int)
- If the host does not receive the handshake, it will kill the process after the timeout

#### Init Request Body

```json
{
  "plugin_id": "my-plugin",
  "data_dir": "/data/plugins/my-plugin",
  "config": "{\"key\": \"value\"}",
  "workspace_id": ""
}
```

- `data_dir`: Plugin-specific data directory for storing configuration files, database files, etc.
- `config`: Plugin configuration set by the administrator in the management panel (JSON string)
- The plugin should complete all resource initialization in Init

### 4. Running

During normal operation, the plugin's HTTP server listens on its port, handling:
- Business API requests proxied from the host
- Hook events from the host (see [Hook System](05-hooks.md))
- Health checks from the host

### 5. Health Check

The host periodically calls:

```
GET /__plugin/health
```

The plugin must return:

```json
{
  "healthy": true,
  "message": "ok",
  "uptime_ms": 123456
}
```

If the health check fails or times out (5 seconds), the host marks the plugin as in an error state.

### 6. Stop

```
POST /__plugin/shutdown
{"reason": "manager_stop"}
```

- The host sends a shutdown request
- The plugin has **10 seconds** to complete cleanup
- After the timeout, the host sends SIGKILL

### 7. Error Recovery

| Scenario | Behavior |
|----------|----------|
| Health check fails | Marked as Error state, error information recorded |
| Process crashes | Automatically marked as Stopped when the process exits |
| Startup timeout | Kill the process, mark as Error |

Plugins are not automatically restarted (to avoid crash loops). Administrators must restart manually via the API:

```bash
POST /api/plugins/my-plugin/start
```

## Required Plugin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/__plugin/init` | POST | Initialization (required; startup fails without it) |
| `/__plugin/health` | GET | Health check (required) |
| `/__plugin/hook` | POST | Hook events (required; must return 200 even if no hooks are declared) |
| `/__plugin/shutdown` | POST | Graceful shutdown (optional; if not implemented, the host kills the process directly) |
