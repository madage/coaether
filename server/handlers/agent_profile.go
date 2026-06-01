package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/superco/server/models"
)

type AgentProfileHandler struct {
	DB *sql.DB
}

func NewAgentProfileHandler(db *sql.DB) *AgentProfileHandler {
	return &AgentProfileHandler{DB: db}
}

// List returns all agent profiles for the current user.
func (h *AgentProfileHandler) List(c *gin.Context) {
	userID, _ := c.Get("user_id")

	rows, err := h.DB.Query(
		`SELECT id, user_id, name, avatar, description, agent_id, version, model, backend, enabled, created_at, updated_at
		 FROM agent_profiles WHERE user_id = $1 ORDER BY created_at ASC`, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query profiles"})
		return
	}
	defer rows.Close()

	profiles := make([]models.AgentProfile, 0)
	for rows.Next() {
		var p models.AgentProfile
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Avatar, &p.Description,
			&p.AgentID, &p.Version, &p.Model, &p.Backend, &p.Enabled, &p.CreatedAt, &p.UpdatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan profile"})
			return
		}
		profiles = append(profiles, p)
	}
	c.JSON(http.StatusOK, gin.H{"profiles": profiles})
}

// Get returns a single agent profile by ID.
func (h *AgentProfileHandler) Get(c *gin.Context) {
	userID, _ := c.Get("user_id")
	profileID := c.Param("id")

	var p models.AgentProfile
	err := h.DB.QueryRow(
		`SELECT id, user_id, name, avatar, description, agent_id, version, model, backend, enabled, created_at, updated_at
		 FROM agent_profiles WHERE id = $1 AND user_id = $2`, profileID, userID,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Avatar, &p.Description,
		&p.AgentID, &p.Version, &p.Model, &p.Backend, &p.Enabled, &p.CreatedAt, &p.UpdatedAt)
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

// Create creates a new agent profile.
func (h *AgentProfileHandler) Create(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		AgentID     string `json:"agent_id"`
		Avatar      string `json:"avatar,omitempty"`
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
		`INSERT INTO agent_profiles (id, user_id, name, avatar, description, agent_id, version, model, backend, enabled, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, '', '', 'cli', true, $7, $7)`,
		id, userID, req.Name, avatar, req.Description, req.AgentID, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create profile"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "status": "created"})
}

// Update updates an existing agent profile.
func (h *AgentProfileHandler) Update(c *gin.Context) {
	userID, _ := c.Get("user_id")
	profileID := c.Param("id")

	var req struct {
		Name        *string `json:"name,omitempty"`
		Description *string `json:"description,omitempty"`
		Avatar      *string `json:"avatar,omitempty"`
		AgentID     *string `json:"agent_id,omitempty"`
		Enabled     *bool   `json:"enabled,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build dynamic update query
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
	if req.Enabled != nil {
		addField("enabled", *req.Enabled)
	}

	if len(setClauses) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, profileID, userID)

	query := "UPDATE agent_profiles SET "
	for i, clause := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += clause
	}
	query += " WHERE id = $" + fmt.Sprint(argIdx) + " AND user_id = $" + fmt.Sprint(argIdx+1)
	argIdx += 2

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
}

// Delete deletes an agent profile.
func (h *AgentProfileHandler) Delete(c *gin.Context) {
	userID, _ := c.Get("user_id")
	profileID := c.Param("id")

	result, err := h.DB.Exec(
		`DELETE FROM agent_profiles WHERE id = $1 AND user_id = $2`, profileID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete profile"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "profile not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// ListRuntimes returns available runtime agent entities (capabilities) for the dropdown.
func (h *AgentProfileHandler) ListRuntimes(c *gin.Context) {
	// Return known runtime capabilities that profiles can reference
	// In the future this could query the message bus for active endpoints
	runtimes := []gin.H{
		{"id": "claude", "name": "Claude Code", "description": "AI programming assistant powered by Claude"},
		{"id": "echo", "name": "Echo", "description": "Simple echo backend for testing"},
	}
	c.JSON(http.StatusOK, gin.H{"runtimes": runtimes})
}

