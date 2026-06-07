package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/coaether/server/database"
	"github.com/coaether/server/middleware"
)

type UserHandler struct {
	DB *sql.DB
}

func NewUserHandler(db *sql.DB) *UserHandler {
	return &UserHandler{DB: db}
}

// List returns all users (admin/owner only, for member management)
func (h *UserHandler) List(c *gin.Context) {
	if !middleware.CanManageMembers(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	rows, err := h.DB.Query(
		`SELECT id, username, email, created_at FROM users ORDER BY created_at ASC`,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	type UserSummary struct {
		ID        string `json:"id"`
		Username  string `json:"username"`
		Email     string `json:"email"`
		CreatedAt string `json:"created_at"`
	}

	users := make([]UserSummary, 0)
	for rows.Next() {
		var u UserSummary
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.CreatedAt); err != nil {
			continue
		}
		users = append(users, u)
	}

	c.JSON(http.StatusOK, gin.H{"users": users})
}

// Delete removes a user account (admin/owner only)
func (h *UserHandler) Delete(c *gin.Context) {
	if !middleware.CanManageMembers(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	targetUserID := c.Param("id")
	currentUserID, _ := c.Get("user_id")

	// Cannot delete self
	if targetUserID == currentUserID.(string) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete your own account"})
		return
	}

	// Check if user exists
	var exists bool
	err := h.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, targetUserID).Scan(&exists)
	if err != nil || !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// Check if target user is the last owner in any workspace
	rows, err := h.DB.Query(
		`SELECT wm.workspace_id FROM workspace_members wm
		 WHERE wm.user_id = $1 AND wm.role = 'owner'`,
		targetUserID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	for rows.Next() {
		var wsID string
		if err := rows.Scan(&wsID); err != nil {
			continue
		}
		var ownerCount int
		h.DB.QueryRow(
			`SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'`,
			wsID,
		).Scan(&ownerCount)
		if ownerCount <= 1 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "cannot delete user: they are the last owner of a workspace",
			})
			return
		}
	}

	// Delete the user (CASCADE will remove memberships, sessions, etc.)
	result, err := h.DB.Exec(`DELETE FROM users WHERE id = $1`, targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// Clean up orphaned workspaces (those with no members left)
	database.DB.Exec(`
		DELETE FROM workspaces WHERE id IN (
			SELECT w.id FROM workspaces w
			LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
			GROUP BY w.id HAVING COUNT(wm.user_id) = 0
		)
	`)

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
