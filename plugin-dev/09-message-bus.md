# 消息总线

插件可以通过消息总线与其他插件、AI 智能体进行异步通信。

## 消息格式

所有消息使用 JSON 信封格式：

```json
{
  "from": "plugin:my-plugin",
  "to": "broadcast",
  "type": "plugin.my-plugin:event.widget_created",
  "payload": {
    "widget_id": "w123",
    "name": "My Widget"
  },
  "id": "a1b2c3d4-...",
  "timestamp": 1717000000000
}
```

| 字段 | 说明 |
|------|------|
| `from` | 发送者，格式 `plugin:{name}` |
| `to` | 目标，可选值见下方 |
| `type` | 消息类型，详见命名规范 |
| `payload` | 消息内容（任意 JSON） |
| `id` | 唯一 ID（主程序生成） |
| `timestamp` | Unix 毫秒时间戳 |

## 发送消息

通过 [主机 API](04-host-api.md) 发送：

```
POST /__plugin_host/message
X-Plugin-Id: my-plugin
Content-Type: application/json

{
  "to": "broadcast",
  "type": "plugin.my-plugin:event.widget_created",
  "payload": {"widget_id": "w123"}
}
```

## 消息目标

| to 值 | 说明 |
|-------|------|
| `broadcast` | 广播给所有已连接的端点和插件 |
| `session://{sessionID}` | 发送给指定会话的所有成员 |
| `plugin:{name}` | 发送给指定插件 |
| `agent://{nodeId}/{agentId}` | 发送给指定 AI 智能体 |

## 消息类型命名规范

```
plugin.{name}:{category}.{action}
```

| 类别 | 命名 | 说明 |
|------|------|------|
| 事件 | `plugin.my-plugin:event.widget_created` | 通知事件 |
| 命令 | `plugin.my-plugin:command.sync_data` | 请求对方执行操作 |
| 数据 | `plugin.my-plugin:data.widget_updated` | 数据同步 |
| 请求 | `plugin.my-plugin:request.summarize` | 期望回复的请求 |

### 通配符匹配

插件可以通过 `capabilities.message_types` 声明感兴趣的特定类型。支持 glob 模式：

```json
{
  "capabilities": {
    "message_types": ["plugin.my-plugin:event.*"]
  }
}
```

## 通信模式

### 事件模式（Fire-and-Forget）

```
PluginA                          PluginB
  │                                │
  │── event.widget_created ───────→│
  │                                │  (不期望回复)
```

### 请求-响应模式

```
PluginA                          PluginB
  │                                │
  │── request.summarize ─────────→│
  │                                │
  │←─ response.summarize ─────────│
  │    (关联 id: 使用相同的消息 ID)  │
```

### 命令模式

```
PluginA                          PluginB
  │                                │
  │── command.sync_data ─────────→│
  │    to: "plugin:target-plugin"  │
  │                                │  (明确指定目标)
```

## 消息接收

插件通过 `POST /__plugin/hook` 接收消息总线消息（消息到达时触发 `plugin:message` 钩子）：

```json
{
  "hook_name": "plugin:message",
  "context": {
    "from": "plugin:other-plugin",
    "type": "plugin.other-plugin:event.something",
    "payload": "{\"key\": \"value\"}"
  },
  "async": true
}
```

## Go 插件完整示例

```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "os"
)

func sendEvent(eventType string, payload interface{}) {
    hostAddr := os.Getenv("COAETHER_HOST_ADDR")
    pluginID := os.Getenv("COAETHER_PLUGIN_ID")

    body, _ := json.Marshal(map[string]interface{}{
        "to":      "broadcast",
        "type":    "plugin." + pluginID + ":event." + eventType,
        "payload": payload,
    })

    req, _ := http.NewRequest("POST",
        "http://" + hostAddr + "/__plugin_host/message",
        bytes.NewReader(body))
    req.Header.Set("X-Plugin-Id", pluginID)
    req.Header.Set("Content-Type", "application/json")

    http.DefaultClient.Do(req)
}

// 使用示例
func notifyWidgetCreated(widgetID string) {
    sendEvent("widget_created", map[string]string{
        "widget_id": widgetID,
    })
}
```

## 注意事项

1. **消息持久化**：消息总线默认不保证消息传递，如果目标离线消息会丢失
2. **消息大小**：建议 payload 小于 1MB，超大消息请使用文件存储
3. **不要滥用广播**：广播消息会发给所有端点和插件，频繁广播影响性能
4. **消息类型唯一**：每个插件使用自己的命名空间，不与其他插件冲突
