package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/coaether/server/mailer"
	"github.com/coaether/server/middleware"
	"github.com/coaether/server/models"
)

type WorkspaceHandler struct {
	DB     *sql.DB
	Hub    *DashboardHub
	Mailer *mailer.Mailer
}

func NewWorkspaceHandler(db *sql.DB) *WorkspaceHandler {
	return &WorkspaceHandler{DB: db}
}

func (h *WorkspaceHandler) List(c *gin.Context) {
	userID, _ := c.Get("user_id")

	rows, err := h.DB.Query(
		`SELECT w.id, w.user_id, w.name, w.description, w.created_at, w.updated_at, wm.role
		 FROM workspaces w
		 INNER JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
		 ORDER BY w.created_at ASC`, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query workspaces"})
		return
	}
	defer rows.Close()

	workspaces := make([]models.Workspace, 0)
	for rows.Next() {
		var w models.Workspace
		if err := rows.Scan(&w.ID, &w.UserID, &w.Name, &w.Description, &w.CreatedAt, &w.UpdatedAt, &w.Role); err != nil {
			continue
		}
		workspaces = append(workspaces, w)
	}

	c.JSON(http.StatusOK, gin.H{"workspaces": workspaces})
}

func (h *WorkspaceHandler) Create(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req models.CreateWorkspaceReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	ws := models.Workspace{
		ID:          uuid.New().String(),
		UserID:      userID.(string),
		Name:        req.Name,
		Description: req.Description,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	tx, err := h.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create workspace"})
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(
		`INSERT INTO workspaces (id, user_id, name, description, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		ws.ID, ws.UserID, ws.Name, ws.Description, ws.CreatedAt, ws.UpdatedAt,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create workspace"})
		return
	}

	_, err = tx.Exec(
		`INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
		 VALUES ($1, $2, 'owner', NOW())`,
		ws.ID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create workspace"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create workspace"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("workspaces")
	}
	c.JSON(http.StatusCreated, ws)
}

func (h *WorkspaceHandler) Get(c *gin.Context) {
	wsID := c.Param("id")
	userID, _ := c.Get("user_id")

	// Verify membership
	var role string
	err := h.DB.QueryRow(
		`SELECT wm.role FROM workspace_members wm WHERE wm.workspace_id = $1 AND wm.user_id = $2`,
		wsID, userID,
	).Scan(&role)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	var w models.Workspace
	err = h.DB.QueryRow(
		`SELECT id, user_id, name, description, created_at, updated_at
		 FROM workspaces WHERE id = $1`, wsID,
	).Scan(&w.ID, &w.UserID, &w.Name, &w.Description, &w.CreatedAt, &w.UpdatedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	w.Role = role
	c.JSON(http.StatusOK, w)
}

func (h *WorkspaceHandler) Update(c *gin.Context) {
	wsID := c.Param("id")
	userID, _ := c.Get("user_id")

	var role string
	err := h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, userID,
	).Scan(&role)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if !middleware.RoleAtLeastByRole(role, "admin") {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var req models.UpdateWorkspaceReq
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

	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	sets = append(sets, "updated_at = NOW()")
	args = append(args, wsID)

	query := fmt.Sprintf(
		`UPDATE workspaces SET %s WHERE id = $%d`,
		strings.Join(sets, ", "), argIdx,
	)

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update workspace"})
		return
	}

	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("workspaces")
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *WorkspaceHandler) Delete(c *gin.Context) {
	wsID := c.Param("id")
	userID, _ := c.Get("user_id")

	var role string
	err := h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, userID,
	).Scan(&role)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if !middleware.RoleAtLeastByRole(role, "owner") {
		c.JSON(http.StatusForbidden, gin.H{"error": "only workspace owners can delete workspaces"})
		return
	}

	// Check if this is the user's only workspace
	var count int
	err = h.DB.QueryRow(
		`SELECT COUNT(*) FROM workspace_members WHERE user_id = $1 AND role = 'owner'`,
		userID,
	).Scan(&count)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if count <= 1 {
		var wsCount int
		h.DB.QueryRow(
			`SELECT COUNT(*) FROM workspace_members WHERE user_id = $1`,
			userID,
		).Scan(&wsCount)
		if wsCount <= 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete the only workspace"})
			return
		}
	}

	// Check if this is the "Default" workspace
	var wsName string
	h.DB.QueryRow(`SELECT name FROM workspaces WHERE id = $1`, wsID).Scan(&wsName)
	if wsName == "Default" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete the Default workspace"})
		return
	}

	// Unlink entities from this workspace
	h.DB.Exec(`UPDATE tasks SET workspace_id = NULL WHERE workspace_id = $1`, wsID)
	h.DB.Exec(`UPDATE projects SET workspace_id = NULL WHERE workspace_id = $1`, wsID)
	h.DB.Exec(`UPDATE agent_profiles SET workspace_id = NULL WHERE workspace_id = $1`, wsID)

	// Collect member IDs for notification before deleting
	var memberIDs []string
	mrows, err := h.DB.Query(`SELECT user_id FROM workspace_members WHERE workspace_id = $1`, wsID)
	if err == nil {
		for mrows.Next() {
			var mid string
			mrows.Scan(&mid)
			memberIDs = append(memberIDs, mid)
		}
		mrows.Close()
	}

	result, err := h.DB.Exec(`DELETE FROM workspaces WHERE id = $1`, wsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete workspace"})
		return
	}

	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}

	// Get caller username for notification
	var callerName string
	h.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&callerName)

	if h.Hub != nil {
		for _, mid := range memberIDs {
			h.Hub.SendNotification(mid, "workspace_deleted", "工作区已删除",
				fmt.Sprintf("工作区「%s」已被 %s 删除", wsName, callerName))
			h.Hub.SignalUser(mid, "workspaces")
		}
		h.Hub.SignalChange("tasks")
		h.Hub.SignalChange("projects")
		h.Hub.SignalChange("agent_profiles")
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// --- Member management ---

func (h *WorkspaceHandler) ListMembers(c *gin.Context) {
	wsID := c.Param("id")
	userID, _ := c.Get("user_id")

	var role string
	err := h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, userID,
	).Scan(&role)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	rows, err := h.DB.Query(`
		SELECT wm.workspace_id, wm.user_id, wm.role, wm.joined_at, u.username
		FROM workspace_members wm
		JOIN users u ON u.id = wm.user_id
		WHERE wm.workspace_id = $1
		ORDER BY wm.joined_at ASC
	`, wsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query members"})
		return
	}
	defer rows.Close()

	members := make([]models.WorkspaceMember, 0)
	for rows.Next() {
		var m models.WorkspaceMember
		if err := rows.Scan(&m.WorkspaceID, &m.UserID, &m.Role, &m.JoinedAt, &m.Username); err != nil {
			continue
		}
		members = append(members, m)
	}

	c.JSON(http.StatusOK, gin.H{"members": members})
}

// AddMember adds an existing user by email (admin/owner only)
func (h *WorkspaceHandler) AddMember(c *gin.Context) {
	wsID := c.Param("id")
	userID, _ := c.Get("user_id")

	var callerRole string
	err := h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, userID,
	).Scan(&callerRole)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if !middleware.CanManageMembersByRole(callerRole) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var req models.AddMemberReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var exists bool
	h.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, req.UserID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	_, err = h.DB.Exec(
		`INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3`,
		wsID, req.UserID, req.Role,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add member"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("workspaces")
	}
	c.JSON(http.StatusCreated, gin.H{"status": "member added"})
}

func (h *WorkspaceHandler) UpdateMemberRole(c *gin.Context) {
	wsID := c.Param("id")
	targetUserID := c.Param("userId")
	userID, _ := c.Get("user_id")

	if targetUserID == userID.(string) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot change your own role"})
		return
	}

	var callerRole string
	err := h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, userID,
	).Scan(&callerRole)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if !middleware.CanManageMembersByRole(callerRole) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var req models.UpdateMemberRoleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Role == "owner" && callerRole != models.RoleOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "only owners can grant owner role"})
		return
	}

	if req.Role != models.RoleOwner {
		var targetRole string
		h.DB.QueryRow(
			`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
			wsID, targetUserID,
		).Scan(&targetRole)
		if targetRole == models.RoleOwner {
			var ownerCount int
			h.DB.QueryRow(
				`SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'`,
				wsID,
			).Scan(&ownerCount)
			if ownerCount <= 1 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "cannot change the last owner's role"})
				return
			}
		}
	}

	_, err = h.DB.Exec(
		`UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3`,
		req.Role, wsID, targetUserID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update member role"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalUser(targetUserID, "workspaces")
		h.Hub.SignalChange("workspaces")
	}
	c.JSON(http.StatusOK, gin.H{"status": "role updated"})
}

func (h *WorkspaceHandler) RemoveMember(c *gin.Context) {
	wsID := c.Param("id")
	targetUserID := c.Param("userId")
	userID, _ := c.Get("user_id")

	if targetUserID == userID.(string) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot remove yourself from workspace"})
		return
	}

	var callerRole string
	err := h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, userID,
	).Scan(&callerRole)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if !middleware.CanManageMembersByRole(callerRole) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var targetRole string
	err = h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, targetUserID,
	).Scan(&targetRole)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
		return
	}
	if targetRole == models.RoleOwner {
		var ownerCount int
		h.DB.QueryRow(
			`SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'`,
			wsID,
		).Scan(&ownerCount)
		if ownerCount <= 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot remove the last owner"})
			return
		}
	}

	_, err = h.DB.Exec(
		`DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, targetUserID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove member"})
		return
	}

	// Get workspace name and caller name for notification
	var wsName string
	h.DB.QueryRow("SELECT name FROM workspaces WHERE id = $1", wsID).Scan(&wsName)
	var callerUsername string
	h.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&callerUsername)

	if h.Hub != nil {
		h.Hub.SendNotification(targetUserID, "workspace_removed", "工作区移除通知",
			fmt.Sprintf("你已被 %s 移出工作区「%s」", callerUsername, wsName))
		h.Hub.SignalUser(targetUserID, "workspaces")
		h.Hub.SignalChange("workspaces")
	}
	c.JSON(http.StatusOK, gin.H{"status": "member removed"})
}

// --- Invitation management ---

func generateInviteToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ListPendingInvitations returns pending invitations for the current user's email
func (h *WorkspaceHandler) ListPendingInvitations(c *gin.Context) {
	email, _ := c.Get("email")
	if email == nil || email.(string) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email not found in token"})
		return
	}

	rows, err := h.DB.Query(`
		SELECT pi.id, pi.workspace_id, pi.inviter_id, pi.invitee_email, pi.token, pi.role, pi.status, pi.created_at, pi.expires_at,
		       w.name, u.username
		FROM pending_invitations pi
		JOIN workspaces w ON w.id = pi.workspace_id
		JOIN users u ON u.id = pi.inviter_id
		WHERE pi.invitee_email = $1 AND pi.status = 'pending' AND pi.expires_at > NOW()
		ORDER BY pi.created_at DESC
	`, email.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query invitations"})
		return
	}
	defer rows.Close()

	invitations := make([]models.PendingInvitation, 0)
	for rows.Next() {
		var inv models.PendingInvitation
		if err := rows.Scan(&inv.ID, &inv.WorkspaceID, &inv.InviterID, &inv.InviteeEmail, &inv.Token, &inv.Role, &inv.Status, &inv.CreatedAt, &inv.ExpiresAt,
			&inv.WorkspaceName, &inv.InviterName); err != nil {
			continue
		}
		invitations = append(invitations, inv)
	}

	c.JSON(http.StatusOK, gin.H{"invitations": invitations})
}

// CreateInvitation creates a new invitation for a user by email
func (h *WorkspaceHandler) CreateInvitation(c *gin.Context) {
	wsID := c.Param("id")
	userID, _ := c.Get("user_id")
	username, _ := c.Get("username")

	// Check permission
	var callerRole string
	err := h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, userID,
	).Scan(&callerRole)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if !middleware.CanManageMembersByRole(callerRole) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	var req models.InviteMemberReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if user is already a member
	var existingRole string
	err = h.DB.QueryRow(
		`SELECT wm.role FROM workspace_members wm
		 JOIN users u ON u.id = wm.user_id
		 WHERE wm.workspace_id = $1 AND u.email = $2`,
		wsID, req.Email,
	).Scan(&existingRole)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "user is already a member of this workspace"})
		return
	}

	// Check for existing pending invitation
	var existingID string
	err = h.DB.QueryRow(
		`SELECT id FROM pending_invitations
		 WHERE workspace_id = $1 AND invitee_email = $2 AND status = 'pending' AND expires_at > NOW()`,
		wsID, req.Email,
	).Scan(&existingID)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "an invitation has already been sent to this email"})
		return
	}

	// Create invitation
	token, err := generateInviteToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	inv := models.PendingInvitation{
		ID:           uuid.New().String(),
		WorkspaceID:  wsID,
		InviterID:    userID.(string),
		InviteeEmail: req.Email,
		Token:        token,
		Role:         req.Role,
		Status:       models.InviteStatusPending,
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour), // 7 days
	}

	_, err = h.DB.Exec(
		`INSERT INTO pending_invitations (id, workspace_id, inviter_id, invitee_email, token, role, status, created_at, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		inv.ID, inv.WorkspaceID, inv.InviterID, inv.InviteeEmail, inv.Token, inv.Role, inv.Status, inv.CreatedAt, inv.ExpiresAt,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create invitation"})
		return
	}

	// Get workspace name
	var wsName string
	h.DB.QueryRow(`SELECT name FROM workspaces WHERE id = $1`, wsID).Scan(&wsName)

	// Send email if mailer is configured, otherwise return link
	invLink := ""
	if h.Mailer != nil {
		invName, _ := username.(string)
		if err := h.Mailer.SendInvitation(req.Email, invName, wsName, token); err != nil {
			log.Printf("[Invite] Failed to send email: %v", err)
		}
		invLink = h.Mailer.GenerateInvitationLink(token)
	} else {
		invLink = fmt.Sprintf("%s/invite?token=%s", "http://localhost:5173", token)
	}

	if h.Hub != nil {
		var targetID string
		h.DB.QueryRow(`SELECT id FROM users WHERE email = $1`, req.Email).Scan(&targetID)
		if targetID != "" {
			h.Hub.SignalUser(targetID, "invitations")
		}
		h.Hub.SignalChange("workspaces")
	}

	c.JSON(http.StatusCreated, gin.H{
		"status":       "invitation created",
		"invitation":   inv,
		"redirect_url": invLink,
	})
}

// ListInvitations lists pending invitations for a workspace
func (h *WorkspaceHandler) ListInvitations(c *gin.Context) {
	wsID := c.Param("id")
	userID, _ := c.Get("user_id")

	var callerRole string
	err := h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, userID,
	).Scan(&callerRole)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}

	// All members can see invitations
	rows, err := h.DB.Query(
		`SELECT pi.id, pi.workspace_id, pi.inviter_id, pi.invitee_email, pi.token, pi.role, pi.status, pi.created_at, pi.expires_at
		 FROM pending_invitations pi
		 WHERE pi.workspace_id = $1
		 ORDER BY pi.created_at DESC`,
		wsID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query invitations"})
		return
	}
	defer rows.Close()

	invitations := make([]models.PendingInvitation, 0)
	for rows.Next() {
		var inv models.PendingInvitation
		if err := rows.Scan(&inv.ID, &inv.WorkspaceID, &inv.InviterID, &inv.InviteeEmail, &inv.Token, &inv.Role, &inv.Status, &inv.CreatedAt, &inv.ExpiresAt); err != nil {
			continue
		}
		invitations = append(invitations, inv)
	}

	c.JSON(http.StatusOK, gin.H{"invitations": invitations})
}

// GetInvitationByToken returns invitation details (public, no auth needed)
func (h *WorkspaceHandler) GetInvitationByToken(c *gin.Context) {
	token := c.Param("token")

	var inv models.PendingInvitation
	err := h.DB.QueryRow(
		`SELECT pi.id, pi.workspace_id, pi.inviter_id, pi.invitee_email, pi.token, pi.role, pi.status, pi.created_at, pi.expires_at,
		        w.name, u.username
		 FROM pending_invitations pi
		 JOIN workspaces w ON w.id = pi.workspace_id
		 JOIN users u ON u.id = pi.inviter_id
		 WHERE pi.token = $1`,
		token,
	).Scan(&inv.ID, &inv.WorkspaceID, &inv.InviterID, &inv.InviteeEmail, &inv.Token, &inv.Role, &inv.Status, &inv.CreatedAt, &inv.ExpiresAt,
		&inv.WorkspaceName, &inv.InviterName)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "invitation not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	if inv.Status != models.InviteStatusPending {
		c.JSON(http.StatusGone, gin.H{"error": "invitation is no longer valid", "status": inv.Status})
		return
	}

	if time.Now().After(inv.ExpiresAt) {
		h.DB.Exec(`UPDATE pending_invitations SET status = 'expired' WHERE id = $1`, inv.ID)
		c.JSON(http.StatusGone, gin.H{"error": "invitation has expired", "status": "expired"})
		return
	}

	// Don't expose token in response
	inv.Token = ""
	c.JSON(http.StatusOK, inv)
}

// AcceptInvitation accepts an invitation by token (public, no auth needed)
// If the user is logged in, use their user_id. If not, they'll need to register first.
func (h *WorkspaceHandler) AcceptInvitation(c *gin.Context) {
	token := c.Param("token")
	userID, hasAuth := c.Get("user_id")

	var inv models.PendingInvitation
	err := h.DB.QueryRow(
		`SELECT id, workspace_id, invitee_email, role, status FROM pending_invitations
		 WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
		token,
	).Scan(&inv.ID, &inv.WorkspaceID, &inv.InviteeEmail, &inv.Role, &inv.Status)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "invitation not found or expired"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	if !hasAuth {
		// User must be logged in — send back the token for registration flow
		c.JSON(http.StatusOK, gin.H{
			"status":        "authentication_required",
			"token":         token,
			"invitee_email": inv.InviteeEmail,
			"workspace_id":  inv.WorkspaceID,
		})
		return
	}

	// Verify the logged-in user's email matches the invitation
	var userEmail string
	h.DB.QueryRow(`SELECT email FROM users WHERE id = $1`, userID).Scan(&userEmail)
	if userEmail != inv.InviteeEmail {
		c.JSON(http.StatusForbidden, gin.H{"error": "this invitation was sent to a different email address"})
		return
	}

	// Check if already a member
	var existingRole string
	err = h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		inv.WorkspaceID, userID,
	).Scan(&existingRole)
	if err == nil {
		// Already a member — just mark invitation as accepted
		h.DB.Exec(`UPDATE pending_invitations SET status = 'accepted' WHERE id = $1`, inv.ID)
		c.JSON(http.StatusOK, gin.H{"status": "already a member", "workspace_id": inv.WorkspaceID})
		return
	}

	// Add to workspace
	_, err = h.DB.Exec(
		`INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
		 VALUES ($1, $2, $3, NOW())`,
		inv.WorkspaceID, userID, inv.Role,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to accept invitation"})
		return
	}

	h.DB.Exec(`UPDATE pending_invitations SET status = 'accepted' WHERE id = $1`, inv.ID)

	// Link unassigned entities
	h.DB.Exec(`UPDATE tasks SET workspace_id = $1 WHERE user_id = $2 AND workspace_id IS NULL`, inv.WorkspaceID, userID)
	h.DB.Exec(`UPDATE projects SET workspace_id = $1 WHERE user_id = $2 AND workspace_id IS NULL`, inv.WorkspaceID, userID)
	h.DB.Exec(`UPDATE agent_profiles SET workspace_id = $1 WHERE user_id = $2 AND workspace_id IS NULL`, inv.WorkspaceID, userID)

	if h.Hub != nil {
		h.Hub.SignalChange("workspaces")
	}
	c.JSON(http.StatusOK, gin.H{"status": "accepted", "workspace_id": inv.WorkspaceID})
}

// DeclineInvitation declines an invitation by token (public)
func (h *WorkspaceHandler) DeclineInvitation(c *gin.Context) {
	token := c.Param("token")

	result, err := h.DB.Exec(
		`UPDATE pending_invitations SET status = 'declined' WHERE token = $1 AND status = 'pending'`,
		token,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "invitation not found or already processed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "declined"})
}

// CancelInvitation cancels a pending invitation (admin/owner only)
func (h *WorkspaceHandler) CancelInvitation(c *gin.Context) {
	wsID := c.Param("id")
	invID := c.Param("invitationId")
	userID, _ := c.Get("user_id")

	var callerRole string
	err := h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		wsID, userID,
	).Scan(&callerRole)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if !middleware.CanManageMembersByRole(callerRole) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	result, err := h.DB.Exec(
		`DELETE FROM pending_invitations WHERE id = $1 AND workspace_id = $2`,
		invID, wsID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "invitation not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "cancelled"})
}
