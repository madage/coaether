package models

import (
	"encoding/json"
	"time"
)

type WorkflowStatus string

const (
	WorkflowActive  WorkflowStatus = "active"
	WorkflowPaused  WorkflowStatus = "paused"
	WorkflowDone    WorkflowStatus = "done"
	WorkflowStuck   WorkflowStatus = "stuck"
)

type Workflow struct {
	ID          string         `json:"id"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Status      WorkflowStatus `json:"status"`
	TokenBudget int64          `json:"token_budget"`
	TokensUsed  int64          `json:"tokens_used"`
	CreatedBy   string         `json:"created_by"`
	WorkspaceID string         `json:"workspace_id"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type CreateWorkflowReq struct {
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	TokenBudget *int64 `json:"token_budget,omitempty"`
}

type TaskDependency struct {
	ID          string    `json:"id"`
	TaskID      string    `json:"task_id"`
	DependsOnID string    `json:"depends_on_id"`
	CreatedAt   time.Time `json:"created_at"`
}

type TaskReviewRecord struct {
	ID              string     `json:"id"`
	TaskID          string     `json:"task_id"`
	ReviewerID      *string    `json:"reviewer_id,omitempty"`
	ReviewerAgentID *string    `json:"reviewer_agent_id,omitempty"`
	Action          string     `json:"action"` // approved | rejected
	Comment         string     `json:"comment"`
	LoopCount       int        `json:"loop_count"`
	CreatedAt       time.Time  `json:"created_at"`
}

type AgentToolLog struct {
	ID          string          `json:"id"`
	AgentID     string          `json:"agent_id"`
	WorkflowID  *string         `json:"workflow_id,omitempty"`
	TaskID      *string         `json:"task_id,omitempty"`
	ToolName    string          `json:"tool_name"`
	Parameters  json.RawMessage `json:"parameters"`
	Status      string          `json:"status"` // allowed | denied | error
	DenyReason  string          `json:"deny_reason,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

type WorkflowEscalation struct {
	ID            string     `json:"id"`
	WorkflowID    string     `json:"workflow_id"`
	TaskID        *string    `json:"task_id,omitempty"`
	Level         int        `json:"level"`
	TriggerReason string     `json:"trigger_reason"`
	ActionTaken   string     `json:"action_taken"`
	NotifiedUsers []string   `json:"notified_users"`
	ResolvedAt    *time.Time `json:"resolved_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

type TokenUsage struct {
	ID               string    `json:"id"`
	WorkflowID       *string   `json:"workflow_id,omitempty"`
	TaskID           *string   `json:"task_id,omitempty"`
	AgentProfileID   *string   `json:"agent_profile_id,omitempty"`
	SessionID        *string   `json:"session_id,omitempty"`
	PromptTokens     int       `json:"prompt_tokens"`
	CompletionTokens int       `json:"completion_tokens"`
	TotalTokens      int       `json:"total_tokens"`
	Stage            string    `json:"stage"` // work | evaluate | review
	CreatedAt        time.Time `json:"created_at"`
}
