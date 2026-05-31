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
	DB  *sql.DB
	Hub *WSHub
}

func NewSessionHandler(db *sql.DB, hub *WSHub) *SessionHandler {
	return &SessionHandler{DB: db, Hub: hub}
}

func (h *SessionHandler) Create(c *gin.Context) {
	var req models.CreateSessionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	// Check max concurrent sessions for this node
	var maxSessions, activeCount int
	h.DB.QueryRow("SELECT max_sessions FROM nodes WHERE id = $1", req.NodeID).Scan(&maxSessions)
	if maxSessions > 0 {
		h.DB.QueryRow(
			"SELECT COUNT(*) FROM sessions WHERE node_id = $1 AND status IN ('pending', 'running')",
			req.NodeID,
		).Scan(&activeCount)
		if activeCount >= maxSessions {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "node has reached max concurrent sessions"})
			return
		}
	}

	sessionID := uuid.New().String()
	now := time.Now()

	_, err := h.DB.Exec(
		`INSERT INTO sessions (id, user_id, node_id, agent_id, status, prompt, workspace, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		sessionID, userID, req.NodeID, req.AgentID, models.SessionPending, req.Prompt, req.Workspace, now, now,
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

	// Get agent command for this agent
	agentCmd := "claude"
	if req.AgentID != "" {
		h.DB.QueryRow("SELECT command FROM agents WHERE id = $1", req.AgentID).Scan(&agentCmd)
	}

	// Send task to node via WebSocket
	taskPayload := map[string]string{
		"session_id":    sessionID,
		"agent_id":      req.AgentID,
		"agent_command": agentCmd,
		"prompt":        req.Prompt,
		"workspace":     req.Workspace,
	}
	sent := h.Hub.SendTaskToNode(req.NodeID, sessionID, taskPayload)
	if !sent {
		// Node offline — don't block creation, but mark as failed
		h.DB.Exec("UPDATE sessions SET status = $1, error_log = $2, updated_at = NOW() WHERE id = $3",
			models.SessionFailed, "target node is not connected", sessionID)
		redis.SetSessionStatus(sessionID, string(models.SessionFailed))
		h.Hub.BroadcastSessionUpdate(sessionID, models.SessionFailed, req.Prompt, req.Workspace, req.NodeID)
		c.JSON(http.StatusOK, models.SessionResp{
			ID:        sessionID,
			Status:    models.SessionFailed,
			AgentID:   req.AgentID,
			Prompt:    req.Prompt,
			Workspace: req.Workspace,
			NodeID:    req.NodeID,
			CreatedAt: now,
		})
		return
	}

	// Broadcast new session to dashboard clients
	h.Hub.BroadcastSessionUpdate(sessionID, models.SessionPending, req.Prompt, req.Workspace, req.NodeID)

	c.JSON(http.StatusCreated, models.SessionResp{
		ID:        sessionID,
		Status:    models.SessionPending,
		AgentID:   req.AgentID,
		Prompt:    req.Prompt,
		Workspace: req.Workspace,
		NodeID:    req.NodeID,
		CreatedAt: now,
	})
}

func (h *SessionHandler) List(c *gin.Context) {
	userID, _ := c.Get("user_id")

	rows, err := h.DB.Query(
		`SELECT id, user_id, node_id, agent_id, status, prompt, workspace, created_at
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
		var uid, agentID string
		if err := rows.Scan(&s.ID, &uid, &s.NodeID, &agentID, &s.Status, &s.Prompt, &s.Workspace, &s.CreatedAt); err != nil {
			continue
		}
		s.AgentID = agentID
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
		`SELECT id, user_id, node_id, agent_id, status, prompt, workspace, output_log, error_log, pid, created_at, updated_at, completed_at
		 FROM sessions WHERE id = $1`, sessionID,
	).Scan(&s.ID, &s.UserID, &s.NodeID, &s.AgentID, &s.Status, &s.Prompt, &s.Workspace, &s.OutputLog, &s.ErrorLog, &s.Pid, &s.CreatedAt, &s.UpdatedAt, &s.CompletedAt)

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
