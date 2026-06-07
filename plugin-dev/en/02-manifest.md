# Plugin Manifest Specification plugin.json

## File Location

The root of each plugin directory must contain `plugin.json`.

```
plugins/
└── my-plugin-1_0_0/
    └── plugin.json        ← Required
```

## Complete Structure

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
    "zh": "详细的中文描述",
    "en": "Detailed English description"
  },

  "author": "Name <email@example.com>",
  "homepage": "https://github.com/user/my-plugin",
  "license": "MIT",
  "icon": "./icon.svg",

  "capabilities": {
    "hooks": ["task:created", "task:status_changed"],
    "api_routes": ["/api/plugins/my-plugin/*"],
    "message_types": ["my_plugin:event.*"],
    "frontend_components": ["task-detail-tab"],
    "scheduled_tasks": false,
    "database_migrations": false,
    "storage": {
      "kv_store": ["my_plugin_*"],
      "files": ["uploads/*"]
    },
    "http_port": 0
  },

  "dependencies": {
    "plugins": {
      "base-plugin": ">=1.0.0"
    },
    "coaether": ">=0.5.0"
  },

  "permissions": [
    "task:read",
    "task:write",
    "project:read"
  ],

  "frontend": {
    "entry": "./frontend/dist/index.js",
    "slots": {
      "task-detail-tab": "MyTabComponent",
      "settings-page": "MySettingsPage"
    }
  }
}
```

## Field Details

### Basic Fields

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | string | Yes | `/^[a-z][a-z0-9-]{2,48}$/` | Globally unique identifier, used as the plugin ID |
| `version` | string | Yes | `^\d+\.\d+\.\d+$` | SemVer format |
| `type` | string | Yes | "core" / "extension" / "runtime" | Plugin type |
| `label` | object | No | Keys are language codes | UI display name |
| `description` | object | No | Keys are language codes | UI description text |
| `author` | string | No | — | Author contact information |
| `homepage` | string | No | URL | Project homepage |
| `license` | string | No | — | Open source license identifier |
| `icon` | string | No | File path | Icon path (relative to plugin directory) |

### Plugin Types

| Type | Description | Example |
|------|-------------|---------|
| `core` | Core functionality plugin, shipped with the platform | Authentication, Message Bus |
| `extension` | Feature extension plugin, enhances platform capabilities | Notifications, Kanban Enhancement |
| `runtime` | Agent runtime plugin | Claude, GPT runtime |

### capabilities

| Field | Type | Description |
|-------|------|-------------|
| `hooks` | string[] | List of events the plugin listens to, see [Hook System](05-hooks.md) |
| `api_routes` | string[] | Route prefixes registered by the plugin, see [API Routes](06-api-routes.md) |
| `message_types` | string[] | Message bus message types, see [Message Bus](09-message-bus.md) |
| `frontend_components` | string[] | Frontend slot names, see [Frontend Slots](07-frontend-slots.md) |
| `scheduled_tasks` | bool | Whether scheduled task scheduling is needed |
| `database_migrations` | bool | Whether database migration scripts exist |
| `storage` | object | Storage requirement declaration |
| `http_port` | int | 0=random port, specify a port for debugging |

### dependencies

| Field | Type | Description |
|-------|------|-------------|
| `plugins` | map[string]string | Other plugins this depends on and their version constraints |
| `coaether` | string | Minimum compatible CoAether version |

### permissions

A string array listing the permissions required by the plugin. See [Permission System](10-permissions.md) for the full permission list.

### frontend

| Field | Type | Description |
|-------|------|-------------|
| `entry` | string | Frontend bundle entry file path (ESM) |
| `slots` | map[string]string | Slot name → React component name mapping |

## Validation Rules

1. `name` must be globally unique; different plugins cannot share the same name
2. `version` changes must follow SemVer
3. `capabilities.api_routes` must start with `/api/plugins/{name}/`
4. Permission strings in `permissions` must be in the predefined permission list
5. Declaring unimplemented hooks is not allowed (i.e., hooks that are declared but not handled by the plugin's `/__plugin/hook`)

## Debugging Tips

The host outputs plugin loading logs:

```
[PluginManager] Registered plugin: my-plugin@1.0.0 (type=extension)
[PluginManager] Plugin started: my-plugin (pid=12345, port=54321)
```

If manifest validation fails:

```
[PluginManager] [WARN] Plugin x: invalid manifest: invalid plugin name "Xxx"
```

The plugin will not be loaded when validation fails.
