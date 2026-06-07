# 插件生命周期

## 状态机

```
┌──────────┐
│Scanned   │  plugins/ 目录发现 plugin.json
└────┬─────┘
     ↓
┌──────────┐
│Registered│  清单校验通过，注册到管理器
└────┬─────┘
     ↓
┌──────────┐
│Starting  │  启动子进程，等待 handshake
└────┬─────┘
     ↓
┌──────────┐
│Running   │  Handshake 完成，Init 成功
└────┬─────┘
     ↓
┌──────────┐
│Stopping  │  收到停止信号，调用 shutdown
└────┬─────┘
     ↓
┌──────────┐
│Stopped   │  进程已退出
└──────────┘

异常路径：
Running ─→ Error  健康检查失败或进程崩溃
Starting ─→ Error Handshake 超时或 Init 失败
```

## 各阶段详解

### 1. 发现 (Discover)

主程序启动时扫描 `plugins/` 目录下的所有子目录，查找 `plugin.json`。

```go
// 主程序内部逻辑
pluginMgr := plugin.NewManager(".", ".")
loaded, _ := pluginMgr.LoadAndRegister()
// loaded = ["my-plugin", "another-plugin"]
```

### 2. 注册 (Register)

校验 `plugin.json` 后将插件加入管理器。此时插件尚未启动。

### 3. 启动 (Start)

```
PluginManager                 插件子进程
    │                            │
    │  启动二进制                  │
    │───────────────────────────→│
    │                            │  ├ 初始化内部状态
    │                            │  ├ 启动 HTTP 服务器
    │                            │  └ 写入 stdout:
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
    │  状态 → Running            │
```

#### Handshake 协议

插件启动后必须在 **30 秒内** 向 stdout 输出一行 JSON：

```json
{"port": 54321}
```

- `port`：插件 HTTP 服务器的端口号（int）
- 如果主程序未收到 handshake，超时后将杀死进程

#### Init 请求体

```json
{
  "plugin_id": "my-plugin",
  "data_dir": "/data/plugins/my-plugin",
  "config": "{\"key\": \"value\"}",
  "workspace_id": ""
}
```

- `data_dir`：插件专属数据目录，用于存放配置文件、数据库文件等
- `config`：管理员在管理后台设置的插件配置（JSON 字符串）
- 插件应在 Init 中完成所有资源初始化

### 4. 运行 (Running)

正常运行时，插件 HTTP 服务器监听端口，处理：
- 来自主程序代理的业务 API 请求
- 来自主程序的钩子事件（见 [钩子系统](05-hooks.md)）
- 来自主程序的健康检查

### 5. 健康检查

主程序定期调用：

```
GET /__plugin/health
```

插件必须返回：

```json
{
  "healthy": true,
  "message": "ok",
  "uptime_ms": 123456
}
```

如果健康检查失败或超时（5 秒），主程序将插件标记为错误状态。

### 6. 停止 (Stop)

```
POST /__plugin/shutdown
{"reason": "manager_stop"}
```

- 主程序发送 shutdown 请求
- 插件有 **10 秒** 完成清理
- 超时后主程序发送 SIGKILL

### 7. 错误恢复

| 场景 | 行为 |
|------|------|
| 健康检查失败 | 标记为 Error 状态，记录错误信息 |
| 进程崩溃 | 进程退出时自动标记为 Stopped |
| 启动超时 | 杀死进程，标记为 Error |

插件不会自动重启（避免崩溃循环）。管理员需通过 API 手动重启：

```bash
POST /api/plugins/my-plugin/start
```

## 插件必须实现的端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/__plugin/init` | POST | 初始化（必须，否则启动失败） |
| `/__plugin/health` | GET | 健康检查（必须） |
| `/__plugin/hook` | POST | 钩子事件（必须，即使没有声明 hooks 也要返回 200） |
| `/__plugin/shutdown` | POST | 优雅关闭（可选，不实现则主程序直接杀进程） |
