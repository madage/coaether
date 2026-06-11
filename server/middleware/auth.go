package middleware

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func AuthMiddleware(jwtSecret string, db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == authHeader {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			return
		}

		// Check for API token (coaether_ prefix)
		if strings.HasPrefix(tokenStr, "coaether_") {
			hash := sha256.Sum256([]byte(tokenStr))
			tokenHash := hex.EncodeToString(hash[:])

			var uid, uname, uemail string
			var expiresAt sql.NullTime
			err := db.QueryRow(
				`SELECT a.user_id, u.username, u.email, a.expires_at
				 FROM api_tokens a JOIN users u ON a.user_id = u.id
				 WHERE a.token_hash = $1`, tokenHash,
			).Scan(&uid, &uname, &uemail, &expiresAt)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
				return
			}
			if expiresAt.Valid && expiresAt.Time.Before(time.Now()) {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token expired"})
				return
			}

			// Update last_used_at (best-effort)
			db.Exec(`UPDATE api_tokens SET last_used_at = NOW() WHERE token_hash = $1`, tokenHash)

			c.Set("user_id", uid)
			c.Set("username", uname)
			c.Set("email", uemail)
			c.Next()
			return
		}

		// JWT flow
		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		c.Set("user_id", claims["user_id"])
		c.Set("username", claims["username"])
		c.Set("email", claims["email"])
		c.Next()
	}
}
