package middleware

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

func WorkspaceAuthMiddleware(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.Query("workspace_id")
		if workspaceID == "" {
			c.Set("workspace_role", "")
			c.Set("is_workspace_member", false)
			c.Set("validated_workspace_id", "")
			c.Next()
			return
		}

		userID, exists := c.Get("user_id")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		var role string
		err := db.QueryRow(
			`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
			workspaceID, userID,
		).Scan(&role)

		if err == sql.ErrNoRows {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "you are not a member of this workspace"})
			return
		}
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}

		c.Set("workspace_role", role)
		c.Set("is_workspace_member", true)
		c.Set("validated_workspace_id", workspaceID)
		c.Next()
	}
}
