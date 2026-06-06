package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/superco/server/mailer"
	"github.com/superco/server/models"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	DB        *sql.DB
	JWTSecret string
}

func NewAuthHandler(db *sql.DB, jwtSecret string) *AuthHandler {
	return &AuthHandler{DB: db, JWTSecret: jwtSecret}
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

func (h *AuthHandler) Register(c *gin.Context) {
	var req models.RegisterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

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
