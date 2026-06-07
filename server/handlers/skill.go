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

type SkillHandler struct {
	DB  *sql.DB
	Hub *DashboardHub
}

func NewSkillHandler(db *sql.DB) *SkillHandler {
	return &SkillHandler{DB: db}
}

func (h *SkillHandler) List(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	isMember, _ := c.Get("is_workspace_member")
	tag := c.Query("tag")

	query := `SELECT id, workspace_id, name, description, content, tags, source_task_id, source_agent_id, usage_count, created_at, updated_at
		FROM skills WHERE workspace_id = $1`
	args := []interface{}{workspaceID}
	argIdx := 2

	if tag != "" {
		query += fmt.Sprintf(" AND tags @> $%d", argIdx)
		args = append(args, fmt.Sprintf(`["%s"]`, tag))
		argIdx++
	}

	if !isMember.(bool) {
		c.JSON(http.StatusForbidden, gin.H{"error": "workspace member required"})
		return
	}

	query += " ORDER BY usage_count DESC, created_at DESC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query skills"})
		return
	}
	defer rows.Close()

	skills := make([]models.Skill, 0)
	for rows.Next() {
		var s models.Skill
		if err := rows.Scan(&s.ID, &s.WorkspaceID, &s.Name, &s.Description, &s.Content,
			&s.Tags, &s.SourceTaskID, &s.SourceAgentID, &s.UsageCount, &s.CreatedAt, &s.UpdatedAt); err != nil {
			continue
		}
		skills = append(skills, s)
	}

	c.JSON(http.StatusOK, gin.H{"skills": skills})
}

func (h *SkillHandler) Get(c *gin.Context) {
	skillID := c.Param("id")

	var s models.Skill
	err := h.DB.QueryRow(
		`SELECT id, workspace_id, name, description, content, tags, source_task_id, source_agent_id, usage_count, created_at, updated_at
		 FROM skills WHERE id = $1`, skillID,
	).Scan(&s.ID, &s.WorkspaceID, &s.Name, &s.Description, &s.Content,
		&s.Tags, &s.SourceTaskID, &s.SourceAgentID, &s.UsageCount, &s.CreatedAt, &s.UpdatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query skill"})
		return
	}
	c.JSON(http.StatusOK, s)
}

func (h *SkillHandler) Create(c *gin.Context) {
	if !middleware.CanWrite(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	workspaceID := c.Query("workspace_id")

	var req struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Content     string          `json:"content"`
		Tags        json.RawMessage `json:"tags,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" || req.Content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and content are required"})
		return
	}
	if req.Tags == nil {
		req.Tags = json.RawMessage("[]")
	}

	id := uuid.New().String()
	now := time.Now()
	_, err := h.DB.Exec(
		`INSERT INTO skills (id, workspace_id, name, description, content, tags, usage_count, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $7)`,
		id, workspaceID, req.Name, req.Description, req.Content, req.Tags, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create skill"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "status": "created"})
	if h.Hub != nil {
		h.Hub.SignalChange("skills")
	}
}

func (h *SkillHandler) Update(c *gin.Context) {
	if !middleware.CanWrite(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	skillID := c.Param("id")

	var req struct {
		Name        *string          `json:"name,omitempty"`
		Description *string          `json:"description,omitempty"`
		Content     *string          `json:"content,omitempty"`
		Tags        *json.RawMessage `json:"tags,omitempty"`
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
	if req.Content != nil {
		addField("content", *req.Content)
	}
	if req.Tags != nil {
		addField("tags", *req.Tags)
	}

	if len(setClauses) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, skillID)
	query := "UPDATE skills SET "
	for i, clause := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += clause
	}
	query += fmt.Sprintf(" WHERE id = $%d", argIdx)

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update skill"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
	if h.Hub != nil {
		h.Hub.SignalChange("skills")
	}
}

func (h *SkillHandler) Delete(c *gin.Context) {
	if !middleware.CanWrite(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	skillID := c.Param("id")
	result, err := h.DB.Exec(`DELETE FROM skills WHERE id = $1`, skillID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete skill"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
	if h.Hub != nil {
		h.Hub.SignalChange("skills")
	}
}

// ExtractFromTask creates a skill from a completed task's title, description, and comments.
func (h *SkillHandler) ExtractFromTask(c *gin.Context) {
	if !middleware.CanWrite(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	workspaceID := c.Query("workspace_id")

	var req struct {
		TaskID        string `json:"task_id"`
		AgentProfileID string `json:"agent_profile_id,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TaskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "task_id is required"})
		return
	}

	// Fetch task details
	var taskTitle, taskDesc string
	err := h.DB.QueryRow(`SELECT title, COALESCE(description,'') FROM tasks WHERE id = $1`, req.TaskID).Scan(&taskTitle, &taskDesc)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch task"})
		return
	}

	// Fetch agent profile system prompt for context
	agentPrompt := ""
	if req.AgentProfileID != "" {
		h.DB.QueryRow(`SELECT COALESCE(system_prompt,'') FROM agent_profiles WHERE id = $1`, req.AgentProfileID).Scan(&agentPrompt)
	}

	// Build skill content from task data
	content := fmt.Sprintf("## Task: %s\n\n### Description\n%s\n\n", taskTitle, taskDesc)
	if agentPrompt != "" {
		content += fmt.Sprintf("### Agent Context\n%s\n\n", agentPrompt)
	}
	content += "### Solution\n\n(Extracted knowledge from completed task)"

	// Generate a name from the task title (truncate to 128 chars)
	skillName := taskTitle
	if len(skillName) > 128 {
		skillName = skillName[:128]
	}

	// Extract tags from task
	var tagsJSON json.RawMessage
	rows, err := h.DB.Query(`SELECT tag FROM task_tags WHERE task_id = $1`, req.TaskID)
	if err == nil {
		defer rows.Close()
		var tagList []string
		for rows.Next() {
			var t string
			rows.Scan(&t)
			tagList = append(tagList, t)
		}
		tagsJSON, _ = json.Marshal(tagList)
	}
	if tagsJSON == nil {
		tagsJSON = json.RawMessage("[]")
	}

	id := uuid.New().String()
	now := time.Now()
	_, err = h.DB.Exec(
		`INSERT INTO skills (id, workspace_id, name, description, content, tags, source_task_id, source_agent_id, usage_count, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $9)`,
		id, workspaceID, skillName, "Extracted from task: "+taskTitle, content, tagsJSON, req.TaskID, nullOrString(req.AgentProfileID), now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create skill"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "status": "created", "name": skillName})
	if h.Hub != nil {
		h.Hub.SignalChange("skills")
	}
}

func nullOrString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
