# Plugin Protocol Version Changelog

Records plugin system communication protocol and historical standard changes.

## v1 (Current)

Initial version.

### Protocol Baseline

| Item | Value |
|------|-----|
| Communication Method | HTTP 1.1 |
| Data Format | JSON (Content-Type: application/json) |
| Plugin Type | Subprocess (standalone binary) |
| Port Assignment | Random port (`http_port: 0`), reported via stdout handshake |
| Authentication Method | X-Plugin-Id header |
| Lifecycle Endpoints | /__plugin/init, /__plugin/health, /__plugin/hook, /__plugin/shutdown |

### Endpoint Versions

| Endpoint | Version | Change History |
|------|------|---------|
| GET /__plugin/health | v1 | Initial |
| POST /__plugin/init | v1 | Initial |
| POST /__plugin/hook | v1 | Initial |
| POST /__plugin/shutdown | v1 | Initial |
| GET /__plugin_host/tasks | v1 | Initial |
| POST /__plugin_host/tasks | v1 | Initial |
| PUT /__plugin_host/tasks/:id | v1 | Initial |
| DELETE /__plugin_host/tasks/:id | v1 | Initial |
| GET /__plugin_host/projects | v1 | Initial |
| POST /__plugin_host/message | v1 | Initial |
| GET /__plugin_host/permission | v1 | Initial |
| POST /__plugin_host/log | v1 | Initial |
| GET /__plugin_host/kv/:key | v1 | Initial |
| POST /__plugin_host/kv/:key | v1 | Initial |
| DELETE /__plugin_host/kv/:key | v1 | Initial |

### Planned Changes

The following changes are under discussion and not yet implemented:

| Proposal | Impact | Expected Version |
|------|------|---------|
| gRPC Support | New communication method, does not use HTTP | v2 |
| Plugin Marketplace | New distribution and version management | v2 |
| Scheduled Task OnTick | New lifecycle endpoint | v2 |
| Message Bus OnMessage | New hook event | v2 |
| Plugin Configuration UI | New admin interface configuration page | v2 |
| File Storage API | New FileStore upload/download | v2 |
