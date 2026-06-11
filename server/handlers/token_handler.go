package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TokenHandler struct {
	DB *sql.DB
}

func NewTokenHandler(db *sql.DB) *TokenHandler {
	return &TokenHandler{DB: db}
}

type createTokenReq struct {
	Name   string `json:"name"`
	Expiry string `json:"expiry"` // "7d", "30d", "90d", "permanent"
}

type apiTokenRow struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  *time.Time `json:"expires_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
}

// List returns all API tokens for the current user (admin/owner only)
func (h *TokenHandler) List(c *gin.Context) {

	userID := c.GetString("user_id")
	rows, err := h.DB.Query(
		`SELECT id, name, created_at, expires_at, last_used_at
		 FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC`, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list tokens"})
		return
	}
	defer rows.Close()

	tokens := make([]apiTokenRow, 0)
	for rows.Next() {
		var t apiTokenRow
		if err := rows.Scan(&t.ID, &t.Name, &t.CreatedAt, &t.ExpiresAt, &t.LastUsedAt); err != nil {
			continue
		}
		tokens = append(tokens, t)
	}
	c.JSON(http.StatusOK, gin.H{"tokens": tokens})
}

// Create generates a new API token and returns the raw value (shown once)
func (h *TokenHandler) Create(c *gin.Context) {

	var req createTokenReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	// Generate raw token: coaether_ + 64 hex chars
	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}
	rawToken := "coaether_" + hex.EncodeToString(rawBytes)

	// SHA-256 hash for storage
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])

	// Calculate expiry
	var expiresAt *time.Time
	switch req.Expiry {
	case "7d":
		t := time.Now().Add(7 * 24 * time.Hour)
		expiresAt = &t
	case "30d":
		t := time.Now().Add(30 * 24 * time.Hour)
		expiresAt = &t
	case "90d":
		t := time.Now().Add(90 * 24 * time.Hour)
		expiresAt = &t
	case "permanent", "":
		expiresAt = nil
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "expiry must be 7d, 30d, 90d, or permanent"})
		return
	}

	id := uuid.New().String()
	userID := c.GetString("user_id")
	now := time.Now()
	_, err := h.DB.Exec(
		`INSERT INTO api_tokens (id, user_id, name, token_hash, expires_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		id, userID, req.Name, tokenHash, expiresAt, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token":      rawToken,
		"id":         id,
		"name":       req.Name,
		"expires_at": expiresAt,
		"created_at": now,
	})
}

// Delete revokes an API token (admin/owner only)
func (h *TokenHandler) Delete(c *gin.Context) {

	tokenID := c.Param("id")
	userID := c.GetString("user_id")

	result, err := h.DB.Exec(
		`DELETE FROM api_tokens WHERE id = $1 AND user_id = $2`,
		tokenID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete token"})
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "token not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "revoked"})
}

// VerifyToken checks a raw API token against the database.
// Returns (userID, username, email, ok).
func VerifyToken(db *sql.DB, rawToken string) (userID, username, email string, ok bool) {
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])

	var uid, uname, uemail string
	var expiresAt sql.NullTime
	err := db.QueryRow(
		`SELECT a.user_id, u.username, u.email, a.expires_at
		 FROM api_tokens a JOIN users u ON a.user_id = u.id
		 WHERE a.token_hash = $1`, tokenHash,
	).Scan(&uid, &uname, &uemail, &expiresAt)
	if err != nil {
		return "", "", "", false
	}

	// Check expiry
	if expiresAt.Valid && expiresAt.Time.Before(time.Now()) {
		return "", "", "", false
	}

	// Update last_used_at (best-effort)
	db.Exec(`UPDATE api_tokens SET last_used_at = NOW() WHERE token_hash = $1`, tokenHash)

	return uid, uname, uemail, true
}
