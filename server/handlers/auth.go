package handlers

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/coaether/server/mailer"
	"github.com/coaether/server/models"
	"golang.org/x/crypto/bcrypt"
)

type captchaEntry struct {
	Code      string
	ExpiresAt time.Time
	NextSend  time.Time
}

type AuthHandler struct {
	DB         *sql.DB
	JWTSecret  string
	captchaMu  sync.Mutex
	captchaMap map[string]*captchaEntry
}

func NewAuthHandler(db *sql.DB, jwtSecret string) *AuthHandler {
	return &AuthHandler{
		DB:         db,
		JWTSecret:  jwtSecret,
		captchaMap: make(map[string]*captchaEntry),
	}
}

// cleanExpiredCaptcha removes expired entries from the captcha map.
func (h *AuthHandler) cleanExpiredCaptcha() {
	now := time.Now()
	for k, v := range h.captchaMap {
		if now.After(v.ExpiresAt) && now.After(v.NextSend) {
			delete(h.captchaMap, k)
		}
	}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	err := h.DB.QueryRow(
		"SELECT id, username, email, password FROM users WHERE email = $1",
		req.Email,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Password)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := h.generateToken(user.ID, user.Username, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	// Get the user's default workspace via membership
	var wsID string
	h.DB.QueryRow(`SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = $1 ORDER BY wm.joined_at ASC LIMIT 1`, user.ID).Scan(&wsID)

	c.JSON(http.StatusOK, models.LoginResp{
		Token:       token,
		User:        user,
		WorkspaceID: wsID,
	})
}

func (h *AuthHandler) SendCaptcha(c *gin.Context) {
	var req models.CaptchaSendReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.captchaMu.Lock()
	defer h.captchaMu.Unlock()

	h.cleanExpiredCaptcha()

	now := time.Now()

	// Check cooldown
	if entry, ok := h.captchaMap[req.Email]; ok && now.Before(entry.NextSend) {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":        "please wait before requesting another code",
			"next_send_at": entry.NextSend.Unix(),
		})
		return
	}

	// Generate random 4-digit code
	code := fmt.Sprintf("%04d", randomInt(10000))

	entry := &captchaEntry{
		Code:      code,
		ExpiresAt: now.Add(5 * time.Minute),
		NextSend:  now.Add(1 * time.Minute),
	}
	h.captchaMap[req.Email] = entry

	c.JSON(http.StatusOK, models.CaptchaSendResp{
		Message:     "verification code sent",
		DefaultCode: code,
		NextSendAt:  entry.NextSend.Unix(),
		ExpiresAt:   entry.ExpiresAt.Unix(),
	})
}

func (h *AuthHandler) GetCaptchaStatus(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email required"})
		return
	}

	h.captchaMu.Lock()
	defer h.captchaMu.Unlock()

	h.cleanExpiredCaptcha()

	if entry, ok := h.captchaMap[email]; ok {
		c.JSON(http.StatusOK, gin.H{
			"next_send_at": entry.NextSend.Unix(),
			"expires_at":   entry.ExpiresAt.Unix(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{})
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req models.RegisterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Password != req.ConfirmPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "passwords do not match"})
		return
	}

	// Validate captcha
	h.captchaMu.Lock()
	entry, hasEntry := h.captchaMap[req.Email]
	if hasEntry {
		if time.Now().After(entry.ExpiresAt) {
			delete(h.captchaMap, req.Email)
			hasEntry = false
		}
	}
	if !hasEntry || entry.Code != req.CaptchaCode {
		h.captchaMu.Unlock()
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid verification code"})
		return
	}
	delete(h.captchaMap, req.Email)
	h.captchaMu.Unlock()

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	username := mailer.ExtractNameFromEmail(req.Email)

	var user models.User
	err = h.DB.QueryRow(
		"INSERT INTO users (id, username, email, password) VALUES (gen_random_uuid()::text, $1, $2, $3) RETURNING id, username, email, created_at",
		username, req.Email, string(hashed),
	).Scan(&user.ID, &user.Username, &user.Email, &user.CreatedAt)

	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already exists"})
		return
	}

	wsID := uuid.New().String()
	hasInvitation := false

	// If registration includes an invitation token, accept it
	if req.InvitationToken != "" {
		var inv models.PendingInvitation
		err := h.DB.QueryRow(
			`SELECT id, workspace_id, inviter_id, role FROM pending_invitations
			 WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
			req.InvitationToken,
		).Scan(&inv.ID, &inv.WorkspaceID, &inv.InviterID, &inv.Role)
		if err == nil {
			hasInvitation = true
			wsID = inv.WorkspaceID
			// Join the invited workspace
			h.DB.Exec(
				`INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
				 VALUES ($1, $2, $3, NOW()) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3`,
				wsID, user.ID, inv.Role,
			)
			h.DB.Exec(
				`UPDATE pending_invitations SET status = 'accepted' WHERE id = $1`,
				inv.ID,
			)

			// Link entities from the old user (inviter's default workspace) to this workspace
			h.DB.Exec(`UPDATE tasks SET workspace_id = $1 WHERE user_id = $2 AND workspace_id IS NULL`, wsID, user.ID)
			h.DB.Exec(`UPDATE projects SET workspace_id = $1 WHERE user_id = $2 AND workspace_id IS NULL`, wsID, user.ID)
			h.DB.Exec(`UPDATE agent_profiles SET workspace_id = $1 WHERE user_id = $2 AND workspace_id IS NULL`, wsID, user.ID)
		}
	}

	if !hasInvitation {
		// No valid invitation — create a default workspace
		h.DB.Exec(
			`INSERT INTO workspaces (id, user_id, name, description, created_at, updated_at)
			 VALUES ($1, $2, 'Default', 'Default workspace', NOW(), NOW())`,
			wsID, user.ID,
		)
		h.DB.Exec(
			`INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
			 VALUES ($1, $2, 'owner', NOW())`,
			wsID, user.ID,
		)
	}

	token, err := h.generateToken(user.ID, user.Username, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusCreated, models.LoginResp{
		Token:       token,
		User:        user,
		WorkspaceID: wsID,
	})
}

func (h *AuthHandler) generateToken(userID, username, email string) (string, error) {
	claims := jwt.MapClaims{
		"user_id":  userID,
		"username": username,
		"email":    email,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.JWTSecret))
}

func randomInt(max int) int {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return 8888 // fallback
	}
	return int(n.Int64())
}
