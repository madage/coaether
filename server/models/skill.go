package models

import (
	"encoding/json"
	"time"
)

type Skill struct {
	ID            string          `json:"id"`
	WorkspaceID   string          `json:"workspace_id"`
	Name          string          `json:"name"`
	Description   string          `json:"description"`
	Content       string          `json:"content"`
	Tags          json.RawMessage `json:"tags"`
	SourceTaskID  *string         `json:"source_task_id"`
	SourceAgentID *string         `json:"source_agent_id"`
	UsageCount    int             `json:"usage_count"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}
