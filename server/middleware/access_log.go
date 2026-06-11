package middleware

import (
	"database/sql"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// AccessLogMiddleware logs API requests to the access_logs table.
// Only logs routes under /api/. Skips /api/logs to avoid noise.
func AccessLogMiddleware(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		elapsed := time.Since(start)

		path := c.Request.URL.Path
		if len(path) < 5 || path[:5] != "/api/" {
			return
		}
		if len(path) >= 9 && path[:9] == "/api/logs" {
			return
		}

		userID, _ := c.Get("user_id")
		username, _ := c.Get("username")
		uid, _ := userID.(string)
		uname, _ := username.(string)

		db.Exec(
			`INSERT INTO access_logs (id, user_id, username, method, path, status, latency_ms, client_ip, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
			uuid.New().String(), uid, uname,
			c.Request.Method, path, c.Writer.Status(),
			int(elapsed.Milliseconds()), c.ClientIP(),
		)
	}
}
