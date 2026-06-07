# Plugin Communication Protocol Specification

## Overview

Communication between the plugin and the host is based on the HTTP 1.1 JSON protocol. This document is the precise protocol-level specification.

## Transport

- **Transport Layer**: TCP
- **Application Layer**: HTTP 1.1
- **Default Port**: Dynamically assigned (random available port)
- **Encoding**: UTF-8
- **Content-Type**: `application/json` (lifecycle endpoints); custom (business endpoints)

## Handshake Protocol

After the plugin starts, it must write a single line of JSON to stdout within 30 seconds:

```
{"port": 54321}\n
```

- Only the first line of stdout is parsed as the handshake
- Subsequent stdout content is captured by the host and output as logs
- stderr content is always forwarded to the host log

## Lifecycle Endpoint Protocol

### POST /__plugin/init

**Request:**
```
POST /__plugin/init HTTP/1.1
Content-Type: application/json

{
  "plugin_id": "my-plugin",
  "workspace_id": "",
  "data_dir": "/data/plugins/my-plugin",
  "config": "{\"key\": \"value\"}"
}
```

| Field | Type | Description |
|------|------|------|
| plugin_id | string | Plugin identifier (same as manifest name) |
| workspace_id | string | Current workspace ID |
| data_dir | string | Directory where the plugin writes data files |
| config | string | Configuration as a JSON string |

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/json

{"ready": true}
```

- `ready: true` = initialization successful
- Non-200 status code = initialization failed, plugin will be terminated

### GET /__plugin/health

**Request:**
```
GET /__plugin/health HTTP/1.1
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "healthy": true,
  "message": "ok",
  "uptime_ms": 123456
}
```

- `healthy`: bool, must be true to indicate healthy
- `message`: human-readable status information
- Timeout: 5 seconds

### POST /__plugin/hook

**Request:**
```
POST /__plugin/hook HTTP/1.1
Content-Type: application/json

{
  "hook_name": "task:created",
  "context": {"task_id": "uuid"},
  "async": false
}
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "aborted": false,
  "error_message": "",
  "mutated_context": {}
}
```

- `aborted`: only valid for synchronous hooks; true means abort subsequent operations
- Timeout: 5 seconds

### POST /__plugin/shutdown

**Request:**
```
POST /__plugin/shutdown HTTP/1.1
Content-Type: application/json

{"reason": "manager_stop"}
```

**Response:**
```
HTTP/1.1 200 OK
```

- The plugin should exit within 10 seconds after receiving this request
- After timeout, the host sends SIGKILL (Unix) or TerminateProcess (Windows)

## Host API Protocol

### Request

```
{method} /__plugin_host/{path} HTTP/1.1
Host: 127.0.0.1:{port}
X-Plugin-Id: my-plugin
Content-Type: application/json
```

### Response

**Success:**
```
HTTP/1.1 200 OK
Content-Type: application/json

{"tasks": [...]}
```

**Insufficient Permissions:**
```
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"allowed": false}
```

**Error:**
```
HTTP/1.1 4xx/5xx
Content-Type: application/json

{"error": "description"}
```

## Reverse Proxy Protocol

### Request Forwarding

```
Client → Host → Plugin
```

After the host receives `/api/plugins/{name}/{path}`:

1. Extract `{name}` → find the running plugin instance
2. Remove the `/api/plugins/{name}` prefix
3. Forward `/{path}` to the plugin's HTTP server
4. Inject headers: `X-Plugin-Id`, `X-Forwarded-Host`

### Response Forwarding

Plugin → Host → Client

The host returns the plugin's HTTP response as-is (status code, headers, body).

## Error Handling

| Scenario | Plugin Behavior | Host Behavior |
|------|---------|-----------|
| Init failure | Return non-200 | Kill process, mark Error |
| Health timeout | — | Mark Error, do not restart |
| Hook timeout | — | Skip that plugin, continue subsequent flow |
| Process crash | — | Mark Stopped |
| Invalid response | — | Ignore, log warning |
