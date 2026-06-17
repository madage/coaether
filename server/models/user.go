package models

import "time"

type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	CreatedAt time.Time `json:"created_at"`
}

type LoginReq struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResp struct {
	Token       string `json:"token"`
	User        User   `json:"user"`
	WorkspaceID string `json:"workspace_id"`
}

type RegisterReq struct {
	Email           string `json:"email" binding:"required"`
	Password        string `json:"password" binding:"required"`
	ConfirmPassword string `json:"confirm_password" binding:"required"`
	CaptchaCode     string `json:"captcha_code" binding:"required"`
	InvitationToken string `json:"invitation_token,omitempty"`
}

type CaptchaSendReq struct {
	Email string `json:"email" binding:"required"`
}

type CaptchaSendResp struct {
	Message    string `json:"message"`
	DefaultCode string `json:"default_code,omitempty"`
	NextSendAt int64  `json:"next_send_at"`
	ExpiresAt  int64  `json:"expires_at"`
}
