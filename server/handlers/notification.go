package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/coaether/server/mailer"
	"github.com/coaether/server/models"
)

type NotificationHandler struct {
	DB     *sql.DB
	Hub    *DashboardHub
	Mailer *mailer.Mailer
}

func NewNotificationHandler(db *sql.DB, hub *DashboardHub) *NotificationHandler {
	return &NotificationHandler{DB: db, Hub: hub}
}

// Create inserts a notification and pushes real-time updates via WebSocket.
func (h *NotificationHandler) Create(userID, notifType, title, message string, taskID *string) (*models.AppNotification, error) {
	id := uuid.New().String()
	now := time.Now()

	_, err := h.DB.Exec(
		`INSERT INTO notifications (id, user_id, type, title, message, task_id, is_read, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, false, $7)`,
		id, userID, notifType, title, message, taskID, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert notification: %w", err)
	}

	n := &models.AppNotification{
		ID:        id,
		UserID:    userID,
		Type:      models.NotificationType(notifType),
		Title:     title,
		Message:   message,
		TaskID:    taskID,
		IsRead:    false,
		CreatedAt: now,
	}

	// Real-time push
	if h.Hub != nil {
		h.Hub.SendNotification(userID, notifType, title, message)
		h.Hub.SignalUser(userID, "notifications")
	}

	// Email notification (async)
	if h.Mailer != nil && h.Mailer.IsConfigured() {
		go func() {
			var email string
			err := h.DB.QueryRow(`SELECT email FROM users WHERE id = $1`, userID).Scan(&email)
			if err != nil || email == "" {
				return
			}
			htmlBody := fmt.Sprintf(`<div style="font-family:sans-serif;padding:20px;max-width:600px">
				<h2 style="color:#1a1a2e;">%s</h2>
				<p style="color:#333;line-height:1.5;">%s</p>
				%s
			</div>`, title, message, taskLinkHTML(taskID))
			h.Mailer.SendNotification(email, title, htmlBody)
		}()
	}

	return n, nil
}

func taskLinkHTML(taskID *string) string {
	if taskID == nil || *taskID == "" {
		return ""
	}
	return fmt.Sprintf(`<p><a href="/tasks/%s" style="color:#1976d2;">View Task</a></p>`, *taskID)
}

// List returns notifications for the current user, newest first, with cursor pagination.
func (h *NotificationHandler) List(c *gin.Context) {
	userID, _ := c.Get("user_id")
	limit := 50
	before := c.Query("before")

	query := `SELECT id, user_id, type, title, message, task_id, is_read, created_at
		FROM notifications
		WHERE user_id = $1`
	args := []interface{}{userID}
	argIdx := 2

	if before != "" {
		query += fmt.Sprintf(` AND created_at <= (SELECT created_at FROM notifications WHERE id = $%d)`, argIdx)
		args = append(args, before)
		argIdx++
	}

	query += ` ORDER BY created_at DESC, id DESC LIMIT $` + fmt.Sprintf("%d", argIdx)
	args = append(args, limit)

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	notifications := make([]models.AppNotification, 0)
	for rows.Next() {
		var n models.AppNotification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Message, &n.TaskID, &n.IsRead, &n.CreatedAt); err != nil {
			continue
		}
		notifications = append(notifications, n)
	}

	c.JSON(http.StatusOK, gin.H{"notifications": notifications})
}

// UnreadCount returns the count of unread notifications for the current user.
func (h *NotificationHandler) UnreadCount(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var count int
	h.DB.QueryRow(
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
		userID,
	).Scan(&count)

	c.JSON(http.StatusOK, gin.H{"count": count})
}

// MarkRead marks a single notification as read.
func (h *NotificationHandler) MarkRead(c *gin.Context) {
	userID, _ := c.Get("user_id")
	notifID := c.Param("id")

	res, err := h.DB.Exec(
		`UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
		notifID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "notification not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// MarkAllRead marks all notifications as read for the current user.
func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
	userID, _ := c.Get("user_id")

	res, err := h.DB.Exec(
		`UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	count, _ := res.RowsAffected()

	c.JSON(http.StatusOK, gin.H{"status": "ok", "count": count})
}

// Delete removes a single notification.
func (h *NotificationHandler) Delete(c *gin.Context) {
	userID, _ := c.Get("user_id")
	notifID := c.Param("id")

	res, err := h.DB.Exec(
		`DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
		notifID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "notification not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
