package models

import "time"

type AgentProfile struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Avatar      string    `json:"avatar"`
	Description string    `json:"description"`
	AgentID     string    `json:"agent_id"`
	NodeID      string    `json:"node_id"`
	Version     string    `json:"version"`
	Model       string    `json:"model"`
	Backend     string    `json:"backend"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
