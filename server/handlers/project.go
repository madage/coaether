package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/superco/server/middleware"
	"github.com/superco/server/models"
)

type ProjectHandler struct {
	DB  *sql.DB
	Hub *DashboardHub
}

func NewProjectHandler(db *sql.DB) *ProjectHandler {
	return &ProjectHandler{DB: db}
}

func (h *ProjectHandler) List(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	isMember, _ := c.Get("is_workspace_member")

	query := `SELECT p.id, p.user_id, p.name, p.description, p.color, p.created_at, p.updated_at,
		        COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL), 0) AS task_count
		 FROM projects p WHERE p.deleted_at IS NULL`
	args := []any{}
	argIdx := 1

	if workspaceID != "" && isMember.(bool) {
		query += fmt.Sprintf(" AND p.workspace_id = $%d", argIdx)
		args = append(args, workspaceID)
		argIdx++
	} else {
		userID, _ := c.Get("user_id")
		query += fmt.Sprintf(" AND p.user_id = $%d", argIdx)
		args = append(args, userID)
		argIdx++
	}
	query += " ORDER BY p.updated_at DESC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query projects"})
		return
	}
	defer rows.Close()

	projects := make([]models.Project, 0)
	for rows.Next() {
		var p models.Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Color, &p.CreatedAt, &p.UpdatedAt, &p.TaskCount); err != nil {
			continue
		}
		projects = append(projects, p)
	}

	c.JSON(http.StatusOK, gin.H{"projects": projects})
}

func (h *ProjectHandler) Create(c *gin.Context) {
	if !middleware.CanWrite(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions to create projects"})
		return
	}

	userID, _ := c.Get("user_id")
	workspaceID := c.Query("workspace_id")

	var req models.CreateProjectReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	color := req.Color
	if color == "" {
		color = "#1976d2"
	}

	now := time.Now()
	project := models.Project{
		ID:          uuid.New().String(),
		UserID:      userID.(string),
		Name:        req.Name,
		Description: req.Description,
		Color:       color,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	_, err := h.DB.Exec(
		`INSERT INTO projects (id, user_id, workspace_id, name, description, color, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		project.ID, project.UserID, workspaceID, project.Name, project.Description, project.Color, project.CreatedAt, project.UpdatedAt,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create project"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("projects")
	}
	c.JSON(http.StatusCreated, project)
}

func (h *ProjectHandler) canModifyProject(c *gin.Context, creatorID string) bool {
	return middleware.HasRole(c, "admin", "owner") ||
		(middleware.HasRole(c, "worker") && middleware.IsOwner(c, creatorID))
}

func (h *ProjectHandler) Get(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	isMember, _ := c.Get("is_workspace_member")
	projectID := c.Param("id")

	query := `SELECT p.id, p.user_id, p.name, p.description, p.color, p.created_at, p.updated_at,
		        COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL), 0) AS task_count
		 FROM projects p WHERE p.id = $1`
	args := []any{projectID}
	argIdx := 2

	if workspaceID != "" && isMember.(bool) {
		query += fmt.Sprintf(" AND p.workspace_id = $%d", argIdx)
		args = append(args, workspaceID)
	} else {
		userID, _ := c.Get("user_id")
		query += fmt.Sprintf(" AND p.user_id = $%d", argIdx)
		args = append(args, userID)
	}

	var p models.Project
	err := h.DB.QueryRow(query, args...).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Color, &p.CreatedAt, &p.UpdatedAt, &p.TaskCount)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	c.JSON(http.StatusOK, p)
}

func (h *ProjectHandler) Update(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	projectID := c.Param("id")

	// Check permission
	var creatorID string
	err := h.DB.QueryRow(`SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&creatorID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if !h.canModifyProject(c, creatorID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var req models.UpdateProjectReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var sets []string
	var args []any
	argIdx := 1

	if req.Name != nil {
		sets = append(sets, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, *req.Name)
		argIdx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *req.Description)
		argIdx++
	}
	if req.Color != nil {
		sets = append(sets, fmt.Sprintf("color = $%d", argIdx))
		args = append(args, *req.Color)
		argIdx++
	}

	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	sets = append(sets, "updated_at = NOW()")
	isMember, _ := c.Get("is_workspace_member")

	args = append(args, projectID)
	whereClause := fmt.Sprintf("WHERE id = $%d", argIdx)
	argIdx++

	if workspaceID != "" && isMember.(bool) {
		args = append(args, workspaceID)
		whereClause += fmt.Sprintf(" AND workspace_id = $%d", argIdx)
	}

	query := fmt.Sprintf("UPDATE projects SET %s %s", strings.Join(sets, ", "), whereClause)

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update project"})
		return
	}

	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	var p models.Project
	h.DB.QueryRow(
		`SELECT p.id, p.user_id, p.name, p.description, p.color, p.created_at, p.updated_at,
		        COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL), 0) AS task_count
		 FROM projects p WHERE p.id = $1`, projectID,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Color, &p.CreatedAt, &p.UpdatedAt, &p.TaskCount)

	if h.Hub != nil {
		h.Hub.SignalChange("projects")
	}
	c.JSON(http.StatusOK, p)
}

func (h *ProjectHandler) Delete(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	projectID := c.Param("id")

	var creatorID string
	err := h.DB.QueryRow(`SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&creatorID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if !h.canModifyProject(c, creatorID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	query := `UPDATE projects SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`
	args := []any{projectID}
	isMember, _ := c.Get("is_workspace_member")
	if workspaceID != "" && isMember.(bool) {
		query += ` AND workspace_id = $2`
		args = append(args, workspaceID)
	}

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete project"})
		return
	}

	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("projects")
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *ProjectHandler) ListTrash(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	isMember, _ := c.Get("is_workspace_member")

	query := `SELECT p.id, p.user_id, p.name, p.description, p.color, p.created_at, p.updated_at,
		        COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL), 0) AS task_count
		 FROM projects p WHERE p.deleted_at IS NOT NULL`
	args := []any{}
	argIdx := 1

	if workspaceID != "" && isMember.(bool) {
		query += fmt.Sprintf(" AND p.workspace_id = $%d", argIdx)
		args = append(args, workspaceID)
		argIdx++
	} else {
		userID, _ := c.Get("user_id")
		query += fmt.Sprintf(" AND p.user_id = $%d", argIdx)
		args = append(args, userID)
		argIdx++
	}
	query += " ORDER BY p.updated_at DESC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query project trash"})
		return
	}
	defer rows.Close()

	projects := make([]models.Project, 0)
	for rows.Next() {
		var p models.Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Color, &p.CreatedAt, &p.UpdatedAt, &p.TaskCount); err != nil {
			continue
		}
		projects = append(projects, p)
	}

	c.JSON(http.StatusOK, gin.H{"projects": projects})
}

func (h *ProjectHandler) PermanentDelete(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	projectID := c.Param("id")

	var creatorID string
	err := h.DB.QueryRow(`SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&creatorID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if !h.canModifyProject(c, creatorID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	isMember, _ := c.Get("is_workspace_member")

	// Unlink tasks from this project first
	unlinkQuery := `UPDATE tasks SET project_id = NULL WHERE project_id = $1`
	unlinkArgs := []any{projectID}
	if workspaceID != "" && isMember.(bool) {
		unlinkQuery += ` AND workspace_id = $2`
		unlinkArgs = append(unlinkArgs, workspaceID)
	}
	_, _ = h.DB.Exec(unlinkQuery, unlinkArgs...)

	query := `DELETE FROM projects WHERE id = $1 AND deleted_at IS NOT NULL`
	args := []any{projectID}
	if workspaceID != "" && isMember.(bool) {
		query += ` AND workspace_id = $2`
		args = append(args, workspaceID)
	}

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to permanently delete project"})
		return
	}

	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("projects")
	}
	c.JSON(http.StatusOK, gin.H{"status": "permanently deleted"})
}

func (h *ProjectHandler) Restore(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	projectID := c.Param("id")

	var creatorID string
	err := h.DB.QueryRow(`SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&creatorID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	if !h.canModifyProject(c, creatorID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	query := `UPDATE projects SET deleted_at = NULL, updated_at = NOW() WHERE id = $1`
	args := []any{projectID}
	isMember, _ := c.Get("is_workspace_member")
	if workspaceID != "" && isMember.(bool) {
		query += ` AND workspace_id = $2`
		args = append(args, workspaceID)
	}

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to restore project"})
		return
	}

	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("projects")
	}
	c.JSON(http.StatusOK, gin.H{"status": "restored"})
}
