package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/superco/server/models"
	"github.com/superco/server/protocol"
)

type SessionHandler struct {
	DB  *sql.DB
	Bus *protocol.MessageBus
}

func NewSessionHandler(db *sql.DB, bus *protocol.MessageBus) *SessionHandler {
	return &SessionHandler{DB: db, Bus: bus}
}

func (h *SessionHandler) Create(c *gin.Context) {
	var req models.CreateSessionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	isBus := strings.HasPrefix(req.NodeID, "bus-")

	// For bus-connected runtimes, validate the runtime endpoint exists
	if isBus {
		epID := isBusNodeRaw(req.NodeID)
		if h.Bus == nil || h.Bus.GetEndpoint(epID) == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bus runtime not connected"})
			return
		}
	} else {
		// Check max concurrent sessions for this node (old system)
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
	}

	sessionID := uuid.New().String()
	now := time.Now()

	// For bus nodes, use the actual node ID and ensure the node record exists
	dbNodeID := req.NodeID
	if isBus {
		epID := isBusNodeRaw(req.NodeID)
		// Upsert bus node record to satisfy FK constraint
		h.DB.Exec(
			`INSERT INTO nodes (id, user_id, name, os, status, version, ip, max_sessions, last_seen, created_at)
			 VALUES ($1, $2, $3, $4, 'online', $5, $6, $7, NOW(), NOW())
			 ON CONFLICT (id) DO UPDATE SET status = 'online', last_seen = NOW()`,
			req.NodeID, userID, "Runtime: "+epID, "unknown", "0.1.0", "bus", 3,
		)

		// Create session in MessageBus so runtime can join and messages route
		h.Bus.CreateSession(sessionID, map[string]protocol.MemberRole{
			"system://api": protocol.RoleOwner,
		})
	}

	_, err := h.DB.Exec(
		`INSERT INTO sessions (id, user_id, node_id, agent_id, status, prompt, workspace, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		sessionID, userID, dbNodeID, req.AgentID, models.SessionPending, req.Prompt, req.Workspace, now, now,
	)
	if err != nil {
		// Clean up bus session on DB error
		if isBus {
			h.Bus.EndSession(sessionID)
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}

	// For bus-connected runtimes, create session via Message Bus
	if isBus {
		epID := isBusNodeRaw(req.NodeID)
		createEnv := protocol.NewEnvelope("system://api", epID, protocol.MsgSessionCreate,
			&protocol.Payload{
				Agents: []protocol.AgentSpec{
					{ID: req.AgentID},
				},
				Workspace: req.Workspace,
			},
		)
		createEnv.SessionID = sessionID
		h.Bus.Deliver(createEnv)

		log.Printf("[Session] Created bus session %s on %s", sessionID, req.NodeID)
		c.JSON(http.StatusCreated, models.SessionResp{
			ID:        sessionID,
			Status:    models.SessionPending,
			AgentID:   req.AgentID,
			Prompt:    req.Prompt,
			Workspace: req.Workspace,
			NodeID:    req.NodeID,
			CreatedAt: now,
		})
		return
	}

	// Non-bus nodes are no longer supported (old agent-node system removed)
	c.JSON(http.StatusBadRequest, gin.H{"error": "only bus-connected runtimes are supported"})
}

func (h *SessionHandler) List(c *gin.Context) {
	userID, _ := c.Get("user_id")
	workspaceID := c.Query("workspace_id")

	var rows *sql.Rows
	var err error
	if workspaceID != "" {
		rows, err = h.DB.Query(
			`SELECT id, user_id, node_id, agent_id, status, prompt, workspace, created_at
			 FROM sessions WHERE user_id = $1 AND workspace = $2 ORDER BY created_at DESC LIMIT 50`,
			userID, workspaceID,
		)
	} else {
		rows, err = h.DB.Query(
			`SELECT id, user_id, node_id, agent_id, status, prompt, workspace, created_at
			 FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, userID,
		)
	}
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

func isBusNodeRaw(nodeID string) string {
	if len(nodeID) > 4 && nodeID[:4] == "bus-" {
		raw := nodeID[4:]
		return strings.ReplaceAll(raw, "--", "://")
	}
	return ""
}
