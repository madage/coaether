package models

import (
	"encoding/json"
	"time"
)

type AgentProfile struct {
	ID             string           `json:"id"`
	UserID         string           `json:"user_id"`
	Name           string           `json:"name"`
	Avatar         string           `json:"avatar"`
	Description    string           `json:"description"`
	SystemPrompt   string           `json:"system_prompt"`
	Instructions   string           `json:"instructions"`
	AgentID        string           `json:"agent_id"`
	NodeID         string           `json:"node_id"`
	Version        string           `json:"version"`
	Model          string           `json:"model"`
	Backend        string           `json:"backend"`
	Enabled        bool             `json:"enabled"`
	MaxConcurrency int              `json:"max_concurrency"`
	CurrentLoad    int              `json:"current_load"`
	Tags           json.RawMessage  `json:"tags"`
	Skills         json.RawMessage  `json:"skills"`
	LastActiveAt   *time.Time       `json:"last_active_at"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`

	// Protocol & Harness fields
	ProtocolVersion   string           `json:"protocol_version,omitempty"`    // legacy | v1.0
	Capabilities      *json.RawMessage `json:"capabilities,omitempty"`        // capabilities JSON
	Permissions       *json.RawMessage `json:"permissions,omitempty"`         // permissions list
	MaxDepth          int              `json:"max_depth"`
	MaxReviewLoops    int              `json:"max_review_loops"`
	CompletionBehavior string          `json:"completion_behavior,omitempty"`
	ReviewSampleRate  float64          `json:"review_sample_rate"`
	ReviewTimeout     int              `json:"review_timeout"`                // minutes
}
