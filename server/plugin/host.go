package plugin

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/coaether/server/database"
	"github.com/coaether/server/protocol"
)

// HostService provides the PluginHost capabilities to plugins via HTTP.
// Plugins call back to the main server at /__plugin_host/* endpoints.
type HostService struct {
	DB          *sql.DB
	MessageBus  *protocol.MessageBus
	Manager     *Manager

	mu    sync.RWMutex
	store map[string][]byte // in-memory KV store (MVP; file-based later)
}

// NewHostService creates a new PluginHost service.
func NewHostService(bus *protocol.MessageBus, mgr *Manager) *HostService {
	return &HostService{
		DB:          database.DB,
		MessageBus:  bus,
		Manager:     mgr,
		store:       make(map[string][]byte),
	}
}

// RegisterRoutes adds the plugin host API routes to a gin router group.
func (h *HostService) RegisterRoutes(r *gin.RouterGroup) {
	host := r.Group("/__plugin_host")
	{
		host.GET("/tasks", h.queryTasks)
		host.GET("/projects", h.queryProjects)
		host.POST("/tasks", h.createTask)
		host.PUT("/tasks/:id", h.updateTask)
		host.DELETE("/tasks/:id", h.deleteTask)
		host.POST("/message", h.sendMessage)
		host.GET("/permission", h.checkPermission)
		host.POST("/log", h.logEntry)
		host.GET("/kv/:key", h.kvGet)
		host.POST("/kv/:key", h.kvSet)
		host.DELETE("/kv/:key", h.kvDelete)
	}
}

// ==================== Task API ====================

func (h *HostService) queryTasks(c *gin.Context) {
	projectID := c.Query("project_id")
	status := c.Query("status")

	q := "SELECT id, user_id, title, description, status, project_id, created_at, updated_at FROM tasks WHERE deleted_at IS NULL"
	var args []interface{}
	argIdx := 1

	if projectID != "" {
		q += fmt.Sprintf(" AND project_id = $%d", argIdx)
		args = append(args, projectID)
		argIdx++
	}
	if status != "" {
		q += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}
	q += " ORDER BY created_at DESC"

	rows, err := h.DB.Query(q, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type taskRow struct {
		ID          string  `json:"id"`
		UserID      string  `json:"user_id"`
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Status      string  `json:"status"`
		ProjectID   *string `json:"project_id"`
		CreatedAt   string  `json:"created_at"`
		UpdatedAt   string  `json:"updated_at"`
	}

	var tasks []taskRow
	for rows.Next() {
		var t taskRow
		if err := rows.Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status, &t.ProjectID, &t.CreatedAt, &t.UpdatedAt); err != nil {
			continue
		}
		tasks = append(tasks, t)
	}
	c.JSON(200, gin.H{"tasks": tasks})
}

func (h *HostService) queryProjects(c *gin.Context) {
	rows, err := h.DB.Query("SELECT id, name, description, color, created_at FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type projectRow struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Color       string `json:"color"`
		CreatedAt   string `json:"created_at"`
	}

	var projects []projectRow
	for rows.Next() {
		var p projectRow
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Color, &p.CreatedAt); err != nil {
			continue
		}
		projects = append(projects, p)
	}
	c.JSON(200, gin.H{"projects": projects})
}

func (h *HostService) createTask(c *gin.Context) {
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		ProjectID   string `json:"project_id"`
		Status      string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	pluginID := c.GetHeader("X-Plugin-Id")

	var taskID string
	status := req.Status
	if status == "" {
		status = "todo"
	}
	err := h.DB.QueryRow(
		`INSERT INTO tasks (id, user_id, title, description, status, project_id, created_at, updated_at)
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NULLIF($5, ''), NOW(), NOW())
		 RETURNING id`,
		pluginID, req.Title, req.Description, status, req.ProjectID,
	).Scan(&taskID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"id": taskID, "title": req.Title, "status": status})
}

func (h *HostService) updateTask(c *gin.Context) {
	id := c.Param("id")
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	setClauses := []string{}
	var args []interface{}
	argIdx := 1
	for k, v := range updates {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", k, argIdx))
		args = append(args, v)
		argIdx++
	}
	if len(setClauses) == 0 {
		c.JSON(400, gin.H{"error": "no fields to update"})
		return
	}
	setClauses = append(setClauses, "updated_at = NOW()")

	q := fmt.Sprintf("UPDATE tasks SET %s WHERE id = $%d", strings.Join(setClauses, ", "), argIdx)
	args = append(args, id)

	if _, err := h.DB.Exec(q, args...); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"updated": true, "id": id})
}

func (h *HostService) deleteTask(c *gin.Context) {
	id := c.Param("id")
	if _, err := h.DB.Exec("UPDATE tasks SET deleted_at = NOW() WHERE id = $1", id); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"deleted": true})
}

// ==================== Message Bus ====================

func (h *HostService) sendMessage(c *gin.Context) {
	var req struct {
		To      string          `json:"to"`
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	pluginID := c.GetHeader("X-Plugin-Id")
	h.MessageBus.SendRaw("plugin:"+pluginID, req.To, req.Type, "", &protocol.Payload{})
	_ = req.Payload
	c.JSON(200, gin.H{"sent": true})
}

// ==================== Permission ====================

func (h *HostService) checkPermission(c *gin.Context) {
	perm := c.Query("perm")
	pluginID := c.GetHeader("X-Plugin-Id")

	if pluginID == "" {
		c.JSON(403, gin.H{"allowed": false})
		return
	}

	inst := h.Manager.Get(pluginID)
	if inst == nil {
		c.JSON(403, gin.H{"allowed": false})
		return
	}

	allowed := false
	for _, p := range inst.Manifest.Permissions {
		if p == perm {
			allowed = true
			break
		}
	}
	c.JSON(200, gin.H{"allowed": allowed})
}

// ==================== Logging ====================

func (h *HostService) logEntry(c *gin.Context) {
	var req struct {
		Level   string            `json:"level"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	pluginID := c.GetHeader("X-Plugin-Id")
	log.Printf("[Plugin:%s][%s] %s %v", pluginID, strings.ToUpper(req.Level), req.Message, req.Fields)
	c.JSON(200, gin.H{"logged": true})
}

// ==================== KV Store ====================

func (h *HostService) kvGet(c *gin.Context) {
	key := c.Param("key")
	h.mu.RLock()
	val, exists := h.store[key]
	h.mu.RUnlock()
	if !exists {
		c.JSON(404, gin.H{"error": "not found"})
		return
	}
	c.Data(200, "application/octet-stream", val)
}

func (h *HostService) kvSet(c *gin.Context) {
	key := c.Param("key")
	data, err := c.GetRawData()
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	h.mu.Lock()
	h.store[key] = data
	h.mu.Unlock()
	c.JSON(200, gin.H{"saved": true})
}

func (h *HostService) kvDelete(c *gin.Context) {
	key := c.Param("key")
	h.mu.Lock()
	delete(h.store, key)
	h.mu.Unlock()
	c.JSON(200, gin.H{"deleted": true})
}
