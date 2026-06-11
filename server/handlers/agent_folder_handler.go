package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AgentFolderHandler struct {
	DB  *sql.DB
	Hub *DashboardHub
}

func NewAgentFolderHandler(db *sql.DB) *AgentFolderHandler {
	return &AgentFolderHandler{DB: db}
}

// List folders with agent count
func (h *AgentFolderHandler) List(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	if workspaceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
		return
	}

	rows, err := h.DB.Query(
		`SELECT f.id, f.name, f.color, f.sort_order, f.created_at, f.updated_at,
			COALESCE((SELECT COUNT(*) FROM agent_folder_items fi WHERE fi.folder_id = f.id), 0) AS agent_count
		 FROM agent_folders f
		 WHERE f.workspace_id = $1
		 ORDER BY f.sort_order ASC, f.created_at ASC`, workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list folders"})
		return
	}
	defer rows.Close()

	type Folder struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Color      string `json:"color"`
		SortOrder  int    `json:"sort_order"`
		AgentCount int    `json:"agent_count"`
		CreatedAt  string `json:"created_at"`
		UpdatedAt  string `json:"updated_at"`
	}
	folders := make([]Folder, 0)
	for rows.Next() {
		var f Folder
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&f.ID, &f.Name, &f.Color, &f.SortOrder, &createdAt, &updatedAt, &f.AgentCount); err != nil {
			continue
		}
		f.CreatedAt = createdAt.Format(time.RFC3339)
		f.UpdatedAt = updatedAt.Format(time.RFC3339)
		folders = append(folders, f)
	}

	c.JSON(http.StatusOK, gin.H{"folders": folders})
}

// Create folder
func (h *AgentFolderHandler) Create(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	if workspaceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workspace_id is required"})
		return
	}
	userID, _ := c.Get("user_id")

	var req struct {
		Name      string `json:"name"`
		Color     string `json:"color"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if req.Color == "" {
		req.Color = "#6366f1"
	}

	id := uuid.New().String()
	now := time.Now()
	_, err := h.DB.Exec(
		`INSERT INTO agent_folders (id, workspace_id, user_id, name, color, sort_order, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
		id, workspaceID, userID, req.Name, req.Color, req.SortOrder, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create folder"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("agent_folders")
	}
	log.Printf("[AgentFolder] Created folder %s", id[:8])
	c.JSON(http.StatusCreated, gin.H{"id": id, "status": "created"})
}

// Update folder (name, color, sort_order)
func (h *AgentFolderHandler) Update(c *gin.Context) {
	folderID := c.Param("id")
	workspaceID := c.Query("workspace_id")

	var req struct {
		Name      *string `json:"name"`
		Color     *string `json:"color"`
		SortOrder *int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify ownership
	var ownerID string
	err := h.DB.QueryRow(
		`SELECT user_id FROM agent_folders WHERE id = $1 AND workspace_id = $2`,
		folderID, workspaceID,
	).Scan(&ownerID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify folder"})
		return
	}

	now := time.Now()
	if req.Name != nil {
		h.DB.Exec(`UPDATE agent_folders SET name = $1, updated_at = $2 WHERE id = $3`, *req.Name, now, folderID)
	}
	if req.Color != nil {
		h.DB.Exec(`UPDATE agent_folders SET color = $1, updated_at = $2 WHERE id = $3`, *req.Color, now, folderID)
	}
	if req.SortOrder != nil {
		h.DB.Exec(`UPDATE agent_folders SET sort_order = $1, updated_at = $2 WHERE id = $3`, *req.SortOrder, now, folderID)
	}

	if h.Hub != nil {
		h.Hub.SignalChange("agent_folders")
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

// Delete folder (agents are not deleted)
func (h *AgentFolderHandler) Delete(c *gin.Context) {
	folderID := c.Param("id")
	workspaceID := c.Query("workspace_id")

	res, err := h.DB.Exec(
		`DELETE FROM agent_folders WHERE id = $1 AND workspace_id = $2`,
		folderID, workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete folder"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("agent_folders")
	}
	log.Printf("[AgentFolder] Deleted folder %s", folderID[:8])
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// AddItem adds an agent to a folder
func (h *AgentFolderHandler) AddItem(c *gin.Context) {
	folderID := c.Param("id")
	workspaceID := c.Query("workspace_id")

	var req struct {
		AgentProfileID string `json:"agent_profile_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AgentProfileID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "agent_profile_id is required"})
		return
	}

	// Verify folder belongs to workspace
	var folderExists bool
	h.DB.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM agent_folders WHERE id = $1 AND workspace_id = $2)`,
		folderID, workspaceID,
	).Scan(&folderExists)
	if !folderExists {
		c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
		return
	}

	id := uuid.New().String()
	now := time.Now()
	_, err := h.DB.Exec(
		`INSERT INTO agent_folder_items (id, folder_id, agent_profile_id, created_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (folder_id, agent_profile_id) DO NOTHING`,
		id, folderID, req.AgentProfileID, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add agent to folder"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("agent_folders")
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "status": "added"})
}

// RemoveItem removes an agent from a folder
func (h *AgentFolderHandler) RemoveItem(c *gin.Context) {
	folderID := c.Param("id")
	agentID := c.Param("agentId")
	workspaceID := c.Query("workspace_id")

	res, err := h.DB.Exec(
		`DELETE FROM agent_folder_items
		 WHERE folder_id = $1 AND agent_profile_id = $2
		 AND folder_id IN (SELECT id FROM agent_folders WHERE workspace_id = $3)`,
		folderID, agentID, workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove agent from folder"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("agent_folders")
	}
	c.JSON(http.StatusOK, gin.H{"status": "removed"})
}

// ListFolderItems returns agents in a specific folder
func (h *AgentFolderHandler) ListFolderItems(c *gin.Context) {
	folderID := c.Param("id")

	rows, err := h.DB.Query(
		`SELECT fi.agent_profile_id, ap.name, ap.avatar, ap.description, ap.enabled
		 FROM agent_folder_items fi
		 JOIN agent_profiles ap ON ap.id = fi.agent_profile_id
		 WHERE fi.folder_id = $1
		 ORDER BY fi.sort_order ASC, fi.created_at ASC`, folderID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list folder items"})
		return
	}
	defer rows.Close()

	type FolderItem struct {
		AgentProfileID string `json:"agent_profile_id"`
		AgentName      string `json:"agent_name"`
		Avatar         string `json:"avatar"`
		Description    string `json:"description"`
		Enabled        bool   `json:"enabled"`
	}
	items := make([]FolderItem, 0)
	for rows.Next() {
		var item FolderItem
		if err := rows.Scan(&item.AgentProfileID, &item.AgentName, &item.Avatar, &item.Description, &item.Enabled); err != nil {
			continue
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{"items": items})
}

// GetAgentFolders returns which folders an agent belongs to
func (h *AgentFolderHandler) GetAgentFolders(c *gin.Context) {
	agentID := c.Param("agentId")

	rows, err := h.DB.Query(
		`SELECT f.id, f.name, f.color
		 FROM agent_folder_items fi
		 JOIN agent_folders f ON f.id = fi.folder_id
		 WHERE fi.agent_profile_id = $1
		 ORDER BY f.sort_order ASC`, agentID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list agent folders"})
		return
	}
	defer rows.Close()

	type FolderRef struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	folders := make([]FolderRef, 0)
	for rows.Next() {
		var f FolderRef
		if err := rows.Scan(&f.ID, &f.Name, &f.Color); err != nil {
			continue
		}
		folders = append(folders, f)
	}

	c.JSON(http.StatusOK, gin.H{"folders": folders})
}
