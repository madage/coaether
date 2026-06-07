package models

import "time"

type ProjectStatus string

const (
	ProjPlanning  ProjectStatus = "planning"
	ProjActive    ProjectStatus = "active"
	ProjCompleted ProjectStatus = "completed"
	ProjOnHold    ProjectStatus = "on_hold"
)

type Project struct {
	ID           string        `json:"id"`
	UserID       string        `json:"user_id"`
	Name         string        `json:"name"`
	Description  string        `json:"description"`
	Color        string        `json:"color"`
	TaskCount    int           `json:"task_count"`
	AssigneeID   *string       `json:"assignee_id"`
	AssigneeType *string       `json:"assignee_type"`
	Status       ProjectStatus `json:"status"`
	StartedAt    *time.Time    `json:"started_at"`
	DueAt        *time.Time    `json:"due_at"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

type CreateProjectReq struct {
	Name         string         `json:"name" binding:"required"`
	Description  string         `json:"description"`
	Color        string         `json:"color"`
	AssigneeID   *string        `json:"assignee_id,omitempty"`
	AssigneeType *string        `json:"assignee_type,omitempty"`
	Status       *ProjectStatus `json:"status,omitempty"`
	StartedAt    *time.Time     `json:"started_at,omitempty"`
	DueAt        *time.Time     `json:"due_at,omitempty"`
}

type UpdateProjectReq struct {
	Name         *string        `json:"name,omitempty"`
	Description  *string        `json:"description,omitempty"`
	Color        *string        `json:"color,omitempty"`
	AssigneeID   *string        `json:"assignee_id,omitempty"`
	AssigneeType *string        `json:"assignee_type,omitempty"`
	Status       *ProjectStatus `json:"status,omitempty"`
	StartedAt    *time.Time     `json:"started_at,omitempty"`
	DueAt        *time.Time     `json:"due_at,omitempty"`
}
