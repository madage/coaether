# 扩展主机 API

本指南面向希望向插件系统添加新能力的主程序开发者。当你需要让插件能够访问新的数据或功能时，需要扩展主机 API。

## 扩展示例：添加"标签"管理功能

假设我们要为主程序添加标签（Tag）管理功能，并允许插件读写标签。

### 步骤 1：定义新的权限

在 `server/plugin/manifest.go` 的 `validPermissions()` 中添加：

```go
func validPermissions() map[string]bool {
    return map[string]bool{
        // 现有权限...
        "task:read": true, "task:write": true,
        
        // ★ 新增权限
        "tag:read": true,
        "tag:write": true,
    }
}
```

### 步骤 2：在 HostService 中添加端点

在 `server/plugin/host.go` 中添加新的路由和处理方法：

```go
// HostService 结构体中添加或修改

func (h *HostService) RegisterRoutes(r *gin.RouterGroup) {
    host := r.Group("/__plugin_host")
    {
        // 现有端点...
        host.GET("/tasks", h.queryTasks)
        
        // ★ 新增：标签管理端点
        host.GET("/tags", h.listTags)
        host.POST("/tags", h.createTag)
        host.POST("/tags/assign", h.assignTag)
        host.DELETE("/tags/:id", h.deleteTag)
    }
}

// ★ 新增处理函数

// GET /__plugin_host/tags — 获取所有标签
func (h *HostService) listTags(c *gin.Context) {
    pluginID := c.GetHeader("X-Plugin-Id")
    
    // 权限检查
    if !h.hasPermission(pluginID, "tag:read") {
        c.JSON(403, gin.H{"error": "permission denied"})
        return
    }
    
    rows, err := h.DB.Query("SELECT id, name, color FROM tags ORDER BY name")
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    defer rows.Close()
    
    type Tag struct {
        ID    string `json:"id"`
        Name  string `json:"name"`
        Color string `json:"color"`
    }
    var tags []Tag
    for rows.Next() {
        var t Tag
        if rows.Scan(&t.ID, &t.Name, &t.Color) == nil {
            tags = append(tags, t)
        }
    }
    c.JSON(200, gin.H{"tags": tags})
}

// POST /__plugin_host/tags — 创建标签
func (h *HostService) createTag(c *gin.Context) {
    pluginID := c.GetHeader("X-Plugin-Id")
    if !h.hasPermission(pluginID, "tag:write") {
        c.JSON(403, gin.H{"error": "permission denied"})
        return
    }
    
    var req struct {
        Name  string `json:"name"`
        Color string `json:"color"`
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    
    var id string
    h.DB.QueryRow(
        "INSERT INTO tags (id, name, color) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id",
        req.Name, req.Color,
    ).Scan(&id)
    
    c.JSON(200, gin.H{"id": id, "name": req.Name, "color": req.Color})
}

// ★ 新增：权限检查辅助方法
func (h *HostService) hasPermission(pluginID, perm string) bool {
    inst := h.Manager.Get(pluginID)
    if inst == nil {
        return false
    }
    for _, p := range inst.Manifest.Permissions {
        if p == perm {
            return true
        }
    }
    return false
}
```

### 步骤 3：在 getter 方法中添加自动权限校验（可选）

如果要让现有的 `queryTasks` 等方法也支持新权限，添加检查即可。或者建立统一的中间件模式：

```go
// 权限中间件工厂
func (h *HostService) requirePermission(perm string) gin.HandlerFunc {
    return func(c *gin.Context) {
        pluginID := c.GetHeader("X-Plugin-Id")
        inst := h.Manager.Get(pluginID)
        if inst == nil {
            c.AbortWithStatusJSON(403, gin.H{"error": "unknown plugin"})
            return
        }
        allowed := false
        for _, p := range inst.Manifest.Permissions {
            if p == perm {
                allowed = true
                break
            }
        }
        if !allowed {
            c.AbortWithStatusJSON(403, gin.H{"error": "permission: " + perm + " required"})
            return
        }
        c.Next()
    }
}

// 使用中间件注册路由
func (h *HostService) RegisterRoutes(r *gin.RouterGroup) {
    host := r.Group("/__plugin_host")
    {
        host.GET("/tags", h.requirePermission("tag:read"), h.listTags)
        host.POST("/tags", h.requirePermission("tag:write"), h.createTag)
    }
}
```

### 步骤 4：更新插件文档

在对应章节中添加新的主机 API 参考：

```markdown
## 标签 API

### GET /__plugin_host/tags

查询所有标签。需要权限：`tag:read`。

**响应：**
```json
{
  "tags": [
    {"id": "uuid", "name": "bug", "color": "#f44336"}
  ]
}
```

### POST /__plugin_host/tags

创建标签。需要权限：`tag:write`。

**请求体：**
```json
{"name": "feature", "color": "#4caf50"}
```
```

### 步骤 5：更新 OpenAPI 规范

在 `reference/plugin-host-api-spec.json` 中添加新端点的 OpenAPI 定义。

## 扩展完整模板

以下是添加新功能到主机 API 的完整模板，复制后填空即可：

### host.go 模板

```go
// ==== {功能名} API ====

// GET /__plugin_host/{资源}
func (h *HostService) list{资源}(c *gin.Context) {
    pluginID := c.GetHeader("X-Plugin-Id")
    if !h.hasPermission(pluginID, "{权限}:read") {
        c.JSON(403, gin.H{"error": "permission denied"})
        return
    }
    
    // TODO: 查询数据库并返回列表
    c.JSON(200, gin.H{"{资源}": items})
}

// POST /__plugin_host/{资源}
func (h *HostService) create{资源}(c *gin.Context) {
    pluginID := c.GetHeader("X-Plugin-Id")
    if !h.hasPermission(pluginID, "{权限}:write") {
        c.JSON(403, gin.H{"error": "permission denied"})
        return
    }
    
    var req struct {
        // TODO: 定义请求结构
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    
    // TODO: 插入数据库
    c.JSON(200, gin.H{"result": item})
}

// PUT /__plugin_host/{资源}/:id
func (h *HostService) update{资源}(c *gin.Context) {
    // TODO: 实现更新
}

// DELETE /__plugin_host/{资源}/:id
func (h *HostService) delete{资源}(c *gin.Context) {
    // TODO: 实现删除
}
```

### 路由注册

在 `RegisterRoutes` 方法中：

```go
func (h *HostService) RegisterRoutes(r *gin.RouterGroup) {
    host := r.Group("/__plugin_host")
    {
        // 现有...
        
        // ★ 新增
        host.GET("/{resources}", h.list{资源})
        host.POST("/{resources}", h.create{资源})
        host.PUT("/{resources}/:id", h.update{资源})
        host.DELETE("/{resources}/:id", h.delete{资源})
    }
}
```

## 设计指南

添加新的主机 API 端点时：

1. **URL 风格**：使用 RESTful 风格 `/{资源}` 和 `/{资源}/:id`
2. **权限**：每个端点绑定一个明确的权限字符串——读操作用 `read`，写操作用 `write`
3. **错误返回**：使用统一格式 `{"error": "描述信息"}`，配合合适的 HTTP 状态码
4. **兼容性**：已发布端点的 URL 和响应格式不能随意变更。如需变更，使用版本前缀 `/v2/`
5. **取消 vs 新增**：不要修改现有端点的行为。如果需要不同行为，创建新端点
6. **插件 ID**：始终通过 `X-Plugin-Id` 头部标识调用者，不要信任插件传来的 `user_id`
7. **数据隔离**：确保查询使用了适当的 WHERE 条件，防止插件访问到其不应访问的数据
