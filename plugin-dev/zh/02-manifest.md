# 插件清单规范 plugin.json

## 文件位置

每个插件目录的根目录必须包含 `plugin.json`。

```
plugins/
└── my-plugin-1_0_0/
    └── plugin.json        ← 必填
```

## 完整结构

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

## 字段详解

### 基础字段

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `name` | string | 是 | `/^[a-z][a-z0-9-]{2,48}$/` | 全局唯一标识符，作为插件 ID |
| `version` | string | 是 | `^\d+\.\d+\.\d+$` | SemVer 格式 |
| `type` | string | 是 | "core" / "extension" / "runtime" | 插件类型 |
| `label` | object | 否 | 键为语言代码 | UI 显示名称 |
| `description` | object | 否 | 键为语言代码 | UI 描述文本 |
| `author` | string | 否 | — | 作者联系信息 |
| `homepage` | string | 否 | URL | 项目主页 |
| `license` | string | 否 | — | 开源许可证标识 |
| `icon` | string | 否 | 文件路径 | 图标路径（相对于插件目录） |

### 插件类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `core` | 核心功能插件，随平台发布 | 认证、消息总线 |
| `extension` | 功能扩展插件，增强平台能力 | 通知、看板增强 |
| `runtime` | 智能体运行时插件 | Claude、GPT 运行时 |

### capabilities

| 字段 | 类型 | 说明 |
|------|------|------|
| `hooks` | string[] | 插件监听的事件列表，见 [钩子系统](05-hooks.md) |
| `api_routes` | string[] | 插件注册的路由前缀，见 [API 路由](06-api-routes.md) |
| `message_types` | string[] | 消息总线消息类型，见 [消息总线](09-message-bus.md) |
| `frontend_components` | string[] | 前端插槽名称，见 [前端插槽](07-frontend-slots.md) |
| `scheduled_tasks` | bool | 是否需要定时任务调度 |
| `database_migrations` | bool | 是否有数据库迁移脚本 |
| `storage` | object | 存储需求声明 |
| `http_port` | int | 0=随机端口，指定端口用于调试 |

### dependencies

| 字段 | 类型 | 说明 |
|------|------|------|
| `plugins` | map[string]string | 依赖的其他插件及其版本约束 |
| `coaether` | string | 兼容的 CoAether 最低版本 |

### permissions

字符串数组，列出插件所需权限。完整的权限列表见 [权限系统](10-permissions.md)。

### frontend

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry` | string | 前端打包入口文件路径（ESM） |
| `slots` | map[string]string | 插槽名称 → React 组件名映射 |

## 校验规则

1. `name` 必须全局唯一，不同插件不可同名
2. `version` 变更时必须遵守 SemVer
3. `capabilities.api_routes` 必须以 `/api/plugins/{name}/` 开头
4. `permissions` 中的权限字符串必须在预定义权限列表中
5. 不允许声明未实现的 hooks（即声明了但插件 `/__plugin/hook` 不处理）

## 调试技巧

主程序输出插件加载日志：

```
[PluginManager] Registered plugin: my-plugin@1.0.0 (type=extension)
[PluginManager] Plugin started: my-plugin (pid=12345, port=54321)
```

如果 manifest 校验失败：

```
[PluginManager] [WARN] Plugin x: invalid manifest: invalid plugin name "Xxx"
```

校验失败时插件不会被加载。
