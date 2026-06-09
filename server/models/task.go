package models

import (
	"encoding/json"
	"time"
)

type TaskStatus string

const (
	TaskTodo       TaskStatus = "todo"
	TaskInProgress TaskStatus = "in_progress"
	TaskBlocked    TaskStatus = "blocked"
	TaskCompleted  TaskStatus = "completed"
	TaskDone       TaskStatus = "done"
	TaskReview     TaskStatus = "review"
	TaskStuck      TaskStatus = "stuck"
)

const (
	CompletionAutoDone    = "auto_done"
	CompletionAutoReview  = "auto_review"
	CompletionSampleReview = "sample_review"
	CompletionNeedsReview = "needs_review"
)

type Priority string

const (
	PriorityUrgent Priority = "urgent"
	PriorityHigh   Priority = "high"
	PriorityMedium Priority = "medium"
	PriorityLow    Priority = "low"
)

type Task struct {
	ID           string     `json:"id"`
	UserID       string     `json:"user_id"`
	CreatorName  string     `json:"creator_name,omitempty"`
	Title        string     `json:"title"`
	Description  string     `json:"description"`
	Status       TaskStatus `json:"status"`
	ProjectID    *string    `json:"project_id"`
	ParentID     *string    `json:"parent_id"`
	AssigneeID   *string    `json:"assignee_id"`
	AssigneeType *string    `json:"assignee_type"`
	Priority     Priority   `json:"priority"`
	Tags         []string       `json:"tags"`
	Assignees    []TaskAssignee `json:"assignees,omitempty"`
	DueAt        *time.Time `json:"due_at"`
	CompletedAt  *time.Time `json:"completed_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	// Workflow fields
	WorkflowID        *string          `json:"workflow_id,omitempty"`
	Depth             int              `json:"depth"`
	MaxDepth          int              `json:"max_depth"`
	MaxAgentLoops     int              `json:"max_agent_loops"`
	AgentLoopCount    int              `json:"agent_loop_count"`
	CompletionBehavior string           `json:"completion_behavior,omitempty"`
	ParallelGroup     *string          `json:"parallel_group,omitempty"`

	// Review gate: actions awaiting human approval before dispatch
	PendingReviewActions json.RawMessage `json:"pending_review_actions,omitempty"`
}

type CreateTaskReq struct {
	Title        string    `json:"title" binding:"required"`
	Description  string    `json:"description"`
	ProjectID    *string   `json:"project_id,omitempty"`
	ParentID     *string   `json:"parent_id,omitempty"`
	AssigneeID   *string   `json:"assignee_id,omitempty"`
	AssigneeType *string   `json:"assignee_type,omitempty"`
	Priority     *Priority `json:"priority,omitempty"`
	Tags         []string  `json:"tags,omitempty"`
	DueAt        *time.Time `json:"due_at,omitempty"`
	AutoAssign   bool       `json:"auto_assign,omitempty"`
}

type UpdateTaskReq struct {
	Title        *string    `json:"title,omitempty"`
	Description  *string    `json:"description,omitempty"`
	Status       *string    `json:"status,omitempty"`
	ProjectID    *string    `json:"project_id,omitempty"`
	ParentID     *string    `json:"parent_id,omitempty"`
	AssigneeID   *string    `json:"assignee_id,omitempty"`
	AssigneeType *string    `json:"assignee_type,omitempty"`
	Priority     *Priority  `json:"priority,omitempty"`
	Tags         []string   `json:"tags,omitempty"`
	DueAt        *time.Time `json:"due_at,omitempty"`
}

type SetStatusReq struct {
	Status string `json:"status" binding:"required"`
}

type TaskAssignee struct {
	TaskID       string `json:"task_id"`
	AssigneeID   string `json:"assignee_id"`
	AssigneeType string `json:"assignee_type"`
	Role         string `json:"role"`
}

type AddAssigneeReq struct {
	AssigneeID   string `json:"assignee_id" binding:"required"`
	AssigneeType string `json:"assignee_type" binding:"required"`
}

type TaskTag struct {
	TaskID string `json:"task_id"`
	Tag    string `json:"tag"`
}

type TaskComment struct {
	ID            string     `json:"id"`
	TaskID        string     `json:"task_id"`
	UserID        string     `json:"user_id"`
	Username      string     `json:"username"`
	AgentProfileID *string   `json:"agent_profile_id,omitempty"`
	AgentName     string     `json:"agent_name,omitempty"`
	AgentAvatar   string     `json:"agent_avatar,omitempty"`
	Content       string     `json:"content"`
	ParentID      *string    `json:"parent_id,omitempty"`
	IsAgentComment bool      `json:"is_agent_comment"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type CreateCommentReq struct {
	Content        string  `json:"content" binding:"required"`
	AgentProfileID *string `json:"agent_profile_id,omitempty"`
	ParentID       *string `json:"parent_id,omitempty"`
	IsAgentComment bool    `json:"is_agent_comment,omitempty"`
}
