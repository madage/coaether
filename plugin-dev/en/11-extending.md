# Extending the Host API

This guide is intended for host developers who want to add new capabilities to the plugin system. When you need to let plugins access new data or functionality, you need to extend the host API.

## Extension Example: Adding "Tag" Management

Suppose we want to add tag management to the host and allow plugins to read and write tags.

### Step 1: Define New Permissions

Add to `validPermissions()` in `server/plugin/manifest.go`:

```go
func validPermissions() map[string]bool {
    return map[string]bool{
        // Existing permissions...
        "task:read": true, "task:write": true,
        
        // ★ New permissions
        "tag:read": true,
        "tag:write": true,
    }
}
```

### Step 2: Add Endpoints in HostService

Add new routes and handler methods in `server/plugin/host.go`:

```go
// Add or modify in the HostService struct

func (h *HostService) RegisterRoutes(r *gin.RouterGroup) {
    host := r.Group("/__plugin_host")
    {
        // Existing endpoints...
        host.GET("/tasks", h.queryTasks)
        
        // ★ New: tag management endpoints
        host.GET("/tags", h.listTags)
        host.POST("/tags", h.createTag)
        host.POST("/tags/assign", h.assignTag)
        host.DELETE("/tags/:id", h.deleteTag)
    }
}

// ★ New handler functions

// GET /__plugin_host/tags — Get all tags
func (h *HostService) listTags(c *gin.Context) {
    pluginID := c.GetHeader("X-Plugin-Id")
    
    // Permission check
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

// POST /__plugin_host/tags — Create a tag
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

// ★ New: permission check helper method
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

### Step 3: Add Automatic Permission Validation in Getter Methods (Optional)

If you want existing methods like `queryTasks` to also support the new permission, add the check. Alternatively, set up a unified middleware pattern:

```go
// Permission middleware factory
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

// Register routes using middleware
func (h *HostService) RegisterRoutes(r *gin.RouterGroup) {
    host := r.Group("/__plugin_host")
    {
        host.GET("/tags", h.requirePermission("tag:read"), h.listTags)
        host.POST("/tags", h.requirePermission("tag:write"), h.createTag)
    }
}
```

### Step 4: Update Plugin Documentation

Add the new host API reference in the corresponding section:

```markdown
## Tags API

### GET /__plugin_host/tags

Query all tags. Required permission: `tag:read`.

**Response:**
```json
{
  "tags": [
    {"id": "uuid", "name": "bug", "color": "#f44336"}
  ]
}
```

### POST /__plugin_host/tags

Create a tag. Required permission: `tag:write`.

**Request body:**
```json
{"name": "feature", "color": "#4caf50"}
```
```

### Step 5: Update the OpenAPI Specification

Add OpenAPI definitions for the new endpoints in `reference/plugin-host-api-spec.json`.

## Extension Complete Template

Below is a complete template for adding new functionality to the host API. Copy and fill in the blanks:

### host.go Template

```go
// ==== {FunctionName} API ====

// GET /__plugin_host/{resource}
func (h *HostService) list{Resource}(c *gin.Context) {
    pluginID := c.GetHeader("X-Plugin-Id")
    if !h.hasPermission(pluginID, "{permission}:read") {
        c.JSON(403, gin.H{"error": "permission denied"})
        return
    }
    
    // TODO: Query database and return list
    c.JSON(200, gin.H{"{resource}": items})
}

// POST /__plugin_host/{resource}
func (h *HostService) create{Resource}(c *gin.Context) {
    pluginID := c.GetHeader("X-Plugin-Id")
    if !h.hasPermission(pluginID, "{permission}:write") {
        c.JSON(403, gin.H{"error": "permission denied"})
        return
    }
    
    var req struct {
        // TODO: Define request structure
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    
    // TODO: Insert into database
    c.JSON(200, gin.H{"result": item})
}

// PUT /__plugin_host/{resource}/:id
func (h *HostService) update{Resource}(c *gin.Context) {
    // TODO: Implement update
}

// DELETE /__plugin_host/{resource}/:id
func (h *HostService) delete{Resource}(c *gin.Context) {
    // TODO: Implement delete
}
```

### Route Registration

In the `RegisterRoutes` method:

```go
func (h *HostService) RegisterRoutes(r *gin.RouterGroup) {
    host := r.Group("/__plugin_host")
    {
        // Existing...
        
        // ★ New
        host.GET("/{resources}", h.list{Resource})
        host.POST("/{resources}", h.create{Resource})
        host.PUT("/{resources}/:id", h.update{Resource})
        host.DELETE("/{resources}/:id", h.delete{Resource})
    }
}
```

## Design Guidelines

When adding new host API endpoints:

1. **URL Style**: Use RESTful style `/{resource}` and `/{resource}/:id`
2. **Permissions**: Each endpoint binds to a specific permission string — use `read` for read operations, `write` for write operations
3. **Error Responses**: Use the unified format `{"error": "description"}`, with appropriate HTTP status codes
4. **Compatibility**: Do not arbitrarily change the URL or response format of published endpoints. If changes are needed, use a version prefix `/v2/`
5. **Deprecate vs Add**: Do not modify the behavior of existing endpoints. If different behavior is needed, create a new endpoint
6. **Plugin ID**: Always identify the caller via the `X-Plugin-Id` header; do not trust the `user_id` passed by the plugin
7. **Data Isolation**: Ensure queries use appropriate WHERE conditions to prevent plugins from accessing data they should not see
