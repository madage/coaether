package models

import "time"

type Workspace struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Role        string    `json:"role,omitempty"`
}

type CreateWorkspaceReq struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

type UpdateWorkspaceReq struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

// Workspace roles
const (
	RoleOwner    = "owner"
	RoleAdmin    = "admin"
	RoleWorker   = "worker"
	RoleObserver = "observer"
)

type WorkspaceMember struct {
	WorkspaceID string    `json:"workspace_id"`
	UserID      string    `json:"user_id"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joined_at"`
	Username    string    `json:"username,omitempty"`
}

type AddMemberReq struct {
	UserID string `json:"user_id" binding:"required"`
	Role   string `json:"role" binding:"required,oneof=admin worker observer"`
}

type UpdateMemberRoleReq struct {
	Role string `json:"role" binding:"required,oneof=admin worker observer owner"`
}

// Invitation types
const (
	InviteStatusPending  = "pending"
	InviteStatusAccepted = "accepted"
	InviteStatusDeclined = "declined"
	InviteStatusExpired  = "expired"
)

type PendingInvitation struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	InviterID   string    `json:"inviter_id"`
	InviteeEmail string   `json:"invitee_email"`
	Token       string    `json:"token"`
	Role        string    `json:"role"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	// Joined fields
	WorkspaceName string `json:"workspace_name,omitempty"`
	InviterName   string `json:"inviter_name,omitempty"`
}

type InviteMemberReq struct {
	Email string `json:"email" binding:"required"`
	Role  string `json:"role" binding:"required,oneof=admin worker observer"`
}
