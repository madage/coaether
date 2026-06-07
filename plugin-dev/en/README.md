# CoAether Plugin Development Guide

## Overview

The CoAether plugin system allows developers to extend platform capabilities through independent subprocesses. Plugins run as binaries and communicate with the host via HTTP.

### Plugin Core Concepts

| Concept | Description |
|---------|-------------|
| **Subprocess Model** | Plugins run as independent processes, isolated from the host. A crash does not affect the host |
| **HTTP Communication** | The host forwards API requests to the plugin's HTTP server via a reverse proxy |
| **Plugin Manifest** | Each plugin declares metadata, capabilities, and permissions via `plugin.json` |
| **Frontend Slots** | Plugins can register React components into named slots in the host UI |
| **Hook System** | Plugins listen to host events (task creation, status changes, etc.) and respond accordingly |
| **Host API** | Plugins call back to the host via standard HTTP APIs to access data and functionality |

### Document Structure

```
plugin-dev/
├── README.md                       ← You are here
├── 01-getting-started.md           ← Quick start
├── 02-manifest.md                  ← plugin.json manifest specification
├── 03-lifecycle.md                 ← Lifecycle protocol
├── 04-host-api.md                  ← Host API reference
├── 05-hooks.md                     ← Hook system
├── 06-api-routes.md                ← API routes
├── 07-frontend-slots.md            ← Frontend slots
├── 08-database.md                  ← Database and KV storage
├── 09-message-bus.md               ← Message bus
├── 10-permissions.md               ← Permission system
├── 11-extending.md                 ← Extending the host API
├── examples/                       ← Example plugins
│   ├── hello-world/                ← Minimal example
│   └── task-annotator/             ← Full-featured example
└── reference/                      ← Technical reference
    ├── changelog.md                ← Protocol version changes
    └── plugin-host-api-spec.json   ← Host API OpenAPI specification
```

### Quick Links

- [Quick Start →](01-getting-started.md)
- [plugin.json Specification →](02-manifest.md)
- [Extending the Host API →](11-extending.md)
- [Hello World Example →](examples/hello-world/README.md)
