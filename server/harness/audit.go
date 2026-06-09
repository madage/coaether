package harness

import (
	"database/sql"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
)

// Auditor records all tool call activity for audit trails.
type Auditor struct {
	DB *sql.DB
}

// NewAuditor creates a new auditor.
func NewAuditor(db *sql.DB) *Auditor {
	return &Auditor{DB: db}
}

// AuditLogEntry represents a single audit log entry.
type AuditLogEntry struct {
	ID         string          `json:"id"`
	AgentID    string          `json:"agent_id"`
	WorkflowID *string         `json:"workflow_id,omitempty"`
	TaskID     *string         `json:"task_id,omitempty"`
	ToolName   string          `json:"tool_name"`
	Parameters json.RawMessage `json:"parameters"`
	Status     string          `json:"status"` // allowed | denied | error
	DenyReason string          `json:"deny_reason,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
}

// Log records a tool call in the audit log.
func (a *Auditor) Log(ctx *AgentContext, tc *ToolCall, status, reason string) {
	if a.DB == nil {
		return
	}
	id := uuid.New().String()
	now := time.Now()

	denyReason := ""
	if reason != "" {
		denyReason = reason
	}

	_, err := a.DB.Exec(
		`INSERT INTO agent_tool_logs (id, agent_id, workflow_id, task_id, tool_name, parameters, status, deny_reason, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		id, ctx.AgentProfileID, ctx.WorkflowID, ctx.TaskID,
		tc.Tool, tc.Params, status, denyReason, now,
	)
	if err != nil {
		log.Printf("[Auditor] Failed to write audit log: %v", err)
	}
}

// LogSimple records a tool call with minimal context (for non-Harness API use).
func (a *Auditor) LogSimple(agentID string, toolName string, params json.RawMessage, status, reason string) {
	if a.DB == nil {
		return
	}
	id := uuid.New().String()
	now := time.Now()

	denyReason := ""
	if reason != "" {
		denyReason = reason
	}

	_, err := a.DB.Exec(
		`INSERT INTO agent_tool_logs (id, agent_id, tool_name, parameters, status, deny_reason, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		id, agentID, toolName, params, status, denyReason, now,
	)
	if err != nil {
		log.Printf("[Auditor] Failed to write audit log: %v", err)
	}
}

// QueryRecent returns the most recent audit log entries for an agent.
func (a *Auditor) QueryRecent(agentID string, limit int) ([]AuditLogEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := a.DB.Query(
		`SELECT id, agent_id, workflow_id, task_id, tool_name, parameters, status,
		        COALESCE(deny_reason, ''), created_at
		 FROM agent_tool_logs
		 WHERE agent_id = $1
		 ORDER BY created_at DESC LIMIT $2`,
		agentID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []AuditLogEntry
	for rows.Next() {
		var e AuditLogEntry
		var paramsStr string
		if err := rows.Scan(&e.ID, &e.AgentID, &e.WorkflowID, &e.TaskID,
			&e.ToolName, &paramsStr, &e.Status, &e.DenyReason, &e.CreatedAt); err != nil {
			continue
		}
		e.Parameters = json.RawMessage(paramsStr)
		entries = append(entries, e)
	}
	return entries, nil
}
