package models

import "time"

type NotificationType string

const (
	NotifTaskAssigned     NotificationType = "task_assigned"
	NotifTaskStatusChanged NotificationType = "task_status_changed"
	NotifTaskComment      NotificationType = "task_comment"
	NotifTaskMention      NotificationType = "task_mention"
)

type AppNotification struct {
	ID        string           `json:"id"`
	UserID    string           `json:"user_id"`
	Type      NotificationType `json:"type"`
	Title     string           `json:"title"`
	Message   string           `json:"message"`
	TaskID    *string          `json:"task_id"`
	IsRead    bool             `json:"is_read"`
	CreatedAt time.Time        `json:"created_at"`
}
