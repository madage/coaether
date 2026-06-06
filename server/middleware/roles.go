package middleware

import (
	"github.com/gin-gonic/gin"
)

var roleHierarchy = map[string]int{
	"observer": 0,
	"worker":   1,
	"admin":    2,
	"owner":    3,
}

func getRole(c *gin.Context) string {
	role, exists := c.Get("workspace_role")
	if !exists {
		return ""
	}
	return role.(string)
}

func HasRole(c *gin.Context, roles ...string) bool {
	roleStr := getRole(c)
	for _, r := range roles {
		if roleStr == r {
			return true
		}
	}
	return false
}

func RoleAtLeast(c *gin.Context, minimumRole string) bool {
	roleStr := getRole(c)
	return roleHierarchy[roleStr] >= roleHierarchy[minimumRole]
}

func CanWrite(c *gin.Context) bool {
	return HasRole(c, "admin", "owner", "worker")
}

func CanManageMembers(c *gin.Context) bool {
	return HasRole(c, "admin", "owner")
}

func CanManageMembersByRole(role string) bool {
	return role == "admin" || role == "owner"
}

func RoleAtLeastByRole(role string, minimumRole string) bool {
	return roleHierarchy[role] >= roleHierarchy[minimumRole]
}

func CanDeleteWorkspace(c *gin.Context) bool {
	return HasRole(c, "owner")
}

func IsOwner(c *gin.Context, entityUserID string) bool {
	currentUserID, _ := c.Get("user_id")
	return currentUserID.(string) == entityUserID
}
