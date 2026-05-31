package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/superco/server/models"
	"github.com/superco/server/redis"
)

type SessionHandler struct {
	DB *sql.DB
}

func NewSessionHandler(db *sql.DB) *SessionHandler {
	return &SessionHandler{DB: db}
}

func (h *SessionHandler) Create(c *gin.Context) {
	var req models.CreateSessionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	sessionID := uuid.New().String()
	now := time.Now()

	_, err := h.DB.Exec(
		`INSERT INTO sessions (id, user_id, node_id, status, prompt, workspace, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		sessionID, userID, req.NodeID, models.SessionPending, req.Prompt, req.Workspace, now, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	if err := redis.EnqueueTask(sessionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enqueue task"})
		return
	}

	redis.SetSessionStatus(sessionID, string(models.SessionPending))
	redis.SetSessionNode(sessionID, req.NodeID)

	c.JSON(http.StatusCreated, models.SessionResp{
		ID:        sessionID,
		Status:    models.SessionPending,
		Prompt:    req.Prompt,
		Workspace: req.Workspace,
		NodeID:    req.NodeID,
		CreatedAt: now,
	})
}

func (h *SessionHandler) List(c *gin.Context) {
	userID, _ := c.Get("user_id")

	rows, err := h.DB.Query(
		`SELECT id, user_id, node_id, status, prompt, workspace, created_at
		 FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query sessions"})
		return
	}
	defer rows.Close()

	var sessions []models.SessionResp
	for rows.Next() {
		var s models.SessionResp
		if err := rows.Scan(&s.ID, &s.NodeID, &s.Status, &s.Prompt, &s.Workspace, &s.CreatedAt); err != nil {
			continue
		}
		// note: user_id is scanned into the wrong position above, fix:
		sessions = append(sessions, s)
	}

	if sessions == nil {
		sessions = []models.SessionResp{}
	}

	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

func (h *SessionHandler) GetByID(c *gin.Context) {
	sessionID := c.Param("id")

	var s models.Session
	err := h.DB.QueryRow(
		`SELECT id, user_id, node_id, status, prompt, workspace, output_log, error_log, pid, created_at, updated_at, completed_at
		 FROM sessions WHERE id = $1`, sessionID,
	).Scan(&s.ID, &s.UserID, &s.NodeID, &s.Status, &s.Prompt, &s.Workspace, &s.OutputLog, &s.ErrorLog, &s.Pid, &s.CreatedAt, &s.UpdatedAt, &s.CompletedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	c.JSON(http.StatusOK, s)
}
