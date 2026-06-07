package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/coaether/server/middleware"
	"github.com/coaether/server/models"
)

type AgentProfileHandler struct {
	DB  *sql.DB
	Hub *DashboardHub
}

func NewAgentProfileHandler(db *sql.DB) *AgentProfileHandler {
	return &AgentProfileHandler{DB: db}
}

func (h *AgentProfileHandler) List(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	isMember, _ := c.Get("is_workspace_member")

	query := `SELECT id, user_id, name, avatar, description, COALESCE(system_prompt,''), agent_id, node_id, version, model, backend, enabled, COALESCE(max_concurrency,1), COALESCE(current_load,0), COALESCE(tags,'[]'::jsonb), COALESCE(skills,'[]'::jsonb), last_active_at, created_at, updated_at
		 FROM agent_profiles`
	args := []any{}
	argIdx := 1

	if workspaceID != "" && isMember.(bool) {
		query += fmt.Sprintf(" WHERE workspace_id = $%d", argIdx)
		args = append(args, workspaceID)
		argIdx++
	} else {
		userID, _ := c.Get("user_id")
		query += fmt.Sprintf(" WHERE user_id = $%d", argIdx)
		args = append(args, userID)
		argIdx++
	}
	query += ` ORDER BY created_at ASC`

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query profiles"})
		return
	}
	defer rows.Close()

	profiles := make([]models.AgentProfile, 0)
	for rows.Next() {
		var p models.AgentProfile
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Avatar, &p.Description,
			&p.SystemPrompt, &p.AgentID, &p.NodeID, &p.Version, &p.Model, &p.Backend, &p.Enabled,
				&p.MaxConcurrency, &p.CurrentLoad, &p.Tags, &p.Skills, &p.LastActiveAt, &p.CreatedAt, &p.UpdatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan profile"})
			return
		}
		profiles = append(profiles, p)
	}
	c.JSON(http.StatusOK, gin.H{"profiles": profiles})
}

func (h *AgentProfileHandler) Get(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	isMember, _ := c.Get("is_workspace_member")
	profileID := c.Param("id")

	query := `SELECT id, user_id, name, avatar, description, COALESCE(system_prompt,''), agent_id, node_id, version, model, backend, enabled, COALESCE(max_concurrency,1), COALESCE(current_load,0), COALESCE(tags,'[]'::jsonb), COALESCE(skills,'[]'::jsonb), last_active_at, created_at, updated_at
		 FROM agent_profiles WHERE id = $1`
	args := []any{profileID}
	argIdx := 2

	if workspaceID != "" && isMember.(bool) {
		query += fmt.Sprintf(" AND workspace_id = $%d", argIdx)
		args = append(args, workspaceID)
	} else {
		userID, _ := c.Get("user_id")
		query += fmt.Sprintf(" AND user_id = $%d", argIdx)
		args = append(args, userID)
	}

	var p models.AgentProfile
	err := h.DB.QueryRow(query, args...).Scan(&p.ID, &p.UserID, &p.Name, &p.Avatar, &p.Description,
		&p.SystemPrompt, &p.AgentID, &p.NodeID, &p.Version, &p.Model, &p.Backend, &p.Enabled,
		&p.MaxConcurrency, &p.CurrentLoad, &p.Tags, &p.Skills, &p.LastActiveAt, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query profile"})
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *AgentProfileHandler) canModifyProfile(c *gin.Context, creatorID string) bool {
	return middleware.HasRole(c, "admin", "owner") ||
		(middleware.HasRole(c, "worker") && middleware.IsOwner(c, creatorID))
}

func (h *AgentProfileHandler) Create(c *gin.Context) {
	if !middleware.CanWrite(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions to create profiles"})
		return
	}

	userID, _ := c.Get("user_id")
	workspaceID := c.Query("workspace_id")

	var req struct {
		Name         string          `json:"name"`
		Description  string          `json:"description"`
		SystemPrompt string          `json:"system_prompt"`
		AgentID      string          `json:"agent_id"`
		NodeID       string          `json:"node_id"`
		Avatar       string          `json:"avatar,omitempty"`
		Tags         json.RawMessage `json:"tags,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" || req.AgentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and agent_id are required"})
		return
	}

	avatar := req.Avatar
	if avatar == "" {
		avatar = "🤖"
	}

	id := uuid.New().String()
	now := time.Now()
	_, err := h.DB.Exec(
		`INSERT INTO agent_profiles (id, user_id, workspace_id, name, avatar, description, system_prompt, agent_id, node_id, tags, version, model, backend, enabled, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '', '', 'cli', true, $11, $11)`,
		id, userID, workspaceID, req.Name, avatar, req.Description, req.SystemPrompt, req.AgentID, req.NodeID, req.Tags, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create profile"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "status": "created"})
	if h.Hub != nil {
		h.Hub.SignalChange("agent_profiles")
	}
}

func (h *AgentProfileHandler) Update(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	profileID := c.Param("id")

	// Check permission
	var creatorID string
	err := h.DB.QueryRow(`SELECT user_id FROM agent_profiles WHERE id = $1`, profileID).Scan(&creatorID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}
	if !h.canModifyProfile(c, creatorID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var req struct {
		Name        *string `json:"name,omitempty"`
		SystemPrompt *string          `json:"system_prompt,omitempty"`
		Description *string `json:"description,omitempty"`
		Avatar      *string `json:"avatar,omitempty"`
		AgentID     *string `json:"agent_id,omitempty"`
		NodeID      *string `json:"node_id,omitempty"`
		Enabled     *bool   `json:"enabled,omitempty"`
		MaxConcurrency *int             `json:"max_concurrency,omitempty"`
		Tags         *json.RawMessage `json:"tags,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	addField := func(col string, val interface{}) {
		setClauses = append(setClauses, col+" = $"+fmt.Sprint(argIdx))
		args = append(args, val)
		argIdx++
	}

	if req.Name != nil {
		addField("name", *req.Name)
	}
	if req.Description != nil {
		addField("description", *req.Description)
	}
	if req.Avatar != nil {
		addField("avatar", *req.Avatar)
	}
		if req.AgentID != nil {
			addField("agent_id", *req.AgentID)
		}
		if req.SystemPrompt != nil {
			addField("system_prompt", *req.SystemPrompt)
		}
		if req.NodeID != nil {
			addField("node_id", *req.NodeID)
		}
		if req.MaxConcurrency != nil {
			addField("max_concurrency", *req.MaxConcurrency)
		}
		if req.Tags != nil {
			addField("tags", *req.Tags)
		}
	if req.Enabled != nil {
		addField("enabled", *req.Enabled)
	}

	if len(setClauses) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	setClauses = append(setClauses, "updated_at = NOW()")
	isMember, _ := c.Get("is_workspace_member")

	args = append(args, profileID)
	query := "UPDATE agent_profiles SET "
	for i, clause := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += clause
	}
	query += fmt.Sprintf(" WHERE id = $%d", argIdx)
	argIdx++

	if workspaceID != "" && isMember.(bool) {
		args = append(args, workspaceID)
		query += fmt.Sprintf(" AND workspace_id = $%d", argIdx)
	}

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
	if h.Hub != nil {
		h.Hub.SignalChange("agent_profiles")
	}
}

func (h *AgentProfileHandler) Delete(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	profileID := c.Param("id")

	var creatorID string
	err := h.DB.QueryRow(`SELECT user_id FROM agent_profiles WHERE id = $1`, profileID).Scan(&creatorID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}
	if !h.canModifyProfile(c, creatorID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	query := `DELETE FROM agent_profiles WHERE id = $1`
	args := []interface{}{profileID}
	isMember, _ := c.Get("is_workspace_member")
	if workspaceID != "" && isMember.(bool) {
		query += ` AND workspace_id = $2`
		args = append(args, workspaceID)
	}

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete profile"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
	if h.Hub != nil {
		h.Hub.SignalChange("agent_profiles")
	}
}

func (h *AgentProfileHandler) ListRuntimes(c *gin.Context) {
	runtimes := []gin.H{
		{"id": "claude", "name": "Claude Code", "description": "AI programming assistant powered by Claude"},
		{"id": "echo", "name": "Echo", "description": "Simple echo backend for testing"},
	}
	c.JSON(http.StatusOK, gin.H{"runtimes": runtimes})
}
