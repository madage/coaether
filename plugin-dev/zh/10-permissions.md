# 权限系统

## 概述

插件以声明式的方式在 `plugin.json` 中列出所需权限，主程序在安装和运行时检查权限。

## 声明权限

```json
{
  "permissions": [
    "task:read",
    "task:write",
    "project:read",
    "workspace:read"
  ]
}
```

原则：**最小权限**——只声明插件实际需要的权限。

## 完整权限列表

### 任务

| 权限 | 对应的主机 API | 说明 |
|------|---------------|------|
| `task:read` | `GET /tasks` | 读取任务列表和详情 |
| `task:write` | `POST /tasks`, `PUT /tasks/:id`, `DELETE /tasks/:id` | 创建、更新、删除任务 |

### 项目

| 权限 | 对应的主机 API | 说明 |
|------|---------------|------|
| `project:read` | `GET /projects` | 读取项目列表 |
| `project:write` | - | 创建、更新、删除项目 |

### 工作区

| 权限 | 说明 |
|------|------|
| `workspace:read` | 读取工作区信息和成员 |
| `workspace:write` | 管理工作区设置 |

### 用户

| 权限 | 说明 |
|------|------|
| `user:read` | 读取用户基本信息 |

### AI 智能体

| 权限 | 说明 |
|------|------|
| `agent:execute` | 调用 AI 智能体 |
| `agent:manage` | 管理智能体配置 |

### Webhook

| 权限 | 说明 |
|------|------|
| `webhook:read` | 读取 Webhook 配置 |
| `webhook:write` | 创建和修改 Webhook |

### 评论

| 权限 | 说明 |
|------|------|
| `comment:read` | 读取评论 |
| `comment:write` | 创建和删除评论 |

### 管理

| 权限 | 说明 |
|------|------|
| `admin:config` | 读写全局系统配置 |
| `admin:plugins` | 管理其他插件（启动/停止/卸载） |

## 权限检查方式

### 1. 安装时声明检查

`plugin.json` 的 `permissions` 字段在加载时被主程序校验。未知权限字符串会被拒绝。

### 2. 运行时检查

插件可以调用主机 API 检查某个操作是否有权限：

```
GET /__plugin_host/permission?perm=task:write
X-Plugin-Id: my-plugin

→ {"allowed": true}
```

### 3. 服务端自动检查

主机 API 在处理请求时自动验证权限。如果插件没有相应权限，请求被拒绝：

```
POST /__plugin_host/tasks
X-Plugin-Id: my-plugin
(但 my-plugin 没有声明 task:write)

→ 403 {"allowed": false}
```

## Go 权限检查示例

```go
func checkPermission(perm string) bool {
    hostAddr := os.Getenv("COAETHER_HOST_ADDR")
    pluginID := os.Getenv("COAETHER_PLUGIN_ID")

    url := fmt.Sprintf("http://%s/__plugin_host/permission?perm=%s", hostAddr, perm)
    req, _ := http.NewRequest("GET", url, nil)
    req.Header.Set("X-Plugin-Id", pluginID)

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return false
    }
    defer resp.Body.Close()

    var result struct {
        Allowed bool `json:"allowed"`
    }
    json.NewDecoder(resp.Body).Decode(&result)
    return result.Allowed
}

// 使用示例
if !checkPermission("task:write") {
    http.Error(w, "Permission denied", http.StatusForbidden)
    return
}
```
