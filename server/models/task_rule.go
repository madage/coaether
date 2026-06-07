package models

import (
	"encoding/json"
	"time"
)

type TaskRule struct {
	ID          string          `json:"id"`
	WorkspaceID string          `json:"workspace_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	TriggerType string          `json:"trigger_type"`
	Conditions  json.RawMessage `json:"conditions"`
	Actions     json.RawMessage `json:"actions"`
	Enabled     bool            `json:"enabled"`
	CreatedBy   string          `json:"created_by"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type TaskRuleLog struct {
	ID           string    `json:"id"`
	RuleID       string    `json:"rule_id"`
	TaskID       string    `json:"task_id"`
	TriggerEvent string    `json:"trigger_event"`
	Matched      bool      `json:"matched"`
	Result       string    `json:"result"`
	Log          string    `json:"log"`
	CreatedAt    time.Time `json:"created_at"`
}

type CreateRuleReq struct {
	Name        string          `json:"name" binding:"required"`
	Description string          `json:"description"`
	TriggerType string          `json:"trigger_type" binding:"required"`
	Conditions  json.RawMessage `json:"conditions"`
	Actions     json.RawMessage `json:"actions"`
	Enabled     *bool           `json:"enabled"`
}

type UpdateRuleReq struct {
	Name        *string          `json:"name,omitempty"`
	Description *string          `json:"description,omitempty"`
	TriggerType *string          `json:"trigger_type,omitempty"`
	Conditions  *json.RawMessage `json:"conditions,omitempty"`
	Actions     *json.RawMessage `json:"actions,omitempty"`
	Enabled     *bool            `json:"enabled,omitempty"`
}
