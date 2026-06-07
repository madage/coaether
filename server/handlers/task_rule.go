package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/coaether/server/middleware"
	"github.com/coaether/server/models"
)

type RuleEngine struct {
	DB       *sql.DB
	Hub      *DashboardHub
	Notifier *NotificationHandler
}

func NewRuleEngine(db *sql.DB, hub *DashboardHub, notifier *NotificationHandler) *RuleEngine {
	return &RuleEngine{DB: db, Hub: hub, Notifier: notifier}
}

// Evaluate runs all enabled rules matching the trigger type for the task's workspace.
func (e *RuleEngine) Evaluate(triggerType, taskID string, ctx map[string]interface{}) {
	var workspaceID string
	err := e.DB.QueryRow(`SELECT workspace_id FROM tasks WHERE id = $1`, taskID).Scan(&workspaceID)
	if err != nil {
		return
	}

	rows, err := e.DB.Query(
		`SELECT id, name, conditions, actions FROM task_rules
		 WHERE workspace_id = $1 AND trigger_type = $2 AND enabled = true`, workspaceID, triggerType)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var ruleID, name string
		var condJSON, actJSON []byte
		if err := rows.Scan(&ruleID, &name, &condJSON, &actJSON); err != nil {
			continue
		}

		matched, logMsg := e.evaluateConditions(condJSON, ctx)
		if !matched {
			e.logExecution(ruleID, taskID, triggerType, false, "conditions not met", logMsg)
			continue
		}

		result, execLog := e.executeActions(actJSON, taskID, ctx)
		e.logExecution(ruleID, taskID, triggerType, true, result, execLog)
	}
}

// evaluateConditions checks if the conditions match the context.
// condJSON format: [{"field":"comment_content","op":"matches","value":"@urgent"}, ...]
// All conditions must match (AND logic).
func (e *RuleEngine) evaluateConditions(condJSON []byte, ctx map[string]interface{}) (bool, string) {
	if len(condJSON) == 0 || string(condJSON) == "{}" || string(condJSON) == "null" {
		return true, "no conditions"
	}

	var conds []map[string]interface{}
	if err := json.Unmarshal(condJSON, &conds); err != nil {
		return false, fmt.Sprintf("invalid conditions: %v", err)
	}

	for _, cond := range conds {
		field, _ := cond["field"].(string)
		op, _ := cond["op"].(string)
		value, _ := cond["value"].(string)

		ctxVal, exists := ctx[field]
		if !exists {
			if op == "not_exists" {
				continue
			}
			return false, fmt.Sprintf("field %q not found in context", field)
		}

		ctxStr := fmt.Sprintf("%v", ctxVal)
		var match bool
		switch op {
		case "equals":
			match = ctxStr == value
		case "contains":
			match = strings.Contains(ctxStr, value)
		case "matches":
			re, err := regexp.Compile(value)
			if err != nil {
				return false, fmt.Sprintf("invalid regex %q: %v", value, err)
			}
			match = re.MatchString(ctxStr)
		case "is_null":
			match = ctxStr == "" || ctxStr == "<nil>"
		case "not_exists":
			match = true
		default:
			return false, fmt.Sprintf("unknown op %q", op)
		}

		if !match {
			return false, fmt.Sprintf("condition not met: %s %s %q", field, op, value)
		}
	}
	return true, "all conditions matched"
}

// executeActions runs the action list sequentially.
// actJSON format: [{"type":"set_priority","params":{"priority":"high"}}, ...]
func (e *RuleEngine) executeActions(actJSON []byte, taskID string, ctx map[string]interface{}) (string, string) {
	if len(actJSON) == 0 || string(actJSON) == "[]" || string(actJSON) == "null" {
		return "no actions", ""
	}

	var acts []map[string]interface{}
	if err := json.Unmarshal(actJSON, &acts); err != nil {
		return "failed", fmt.Sprintf("invalid actions: %v", err)
	}

	var results []string
	var logs []string

	for _, act := range acts {
		actType, _ := act["type"].(string)
		params, _ := act["params"].(map[string]interface{})

		result, logLine := e.executeAction(actType, params, taskID, ctx)
		results = append(results, result)
		logs = append(logs, logLine)
	}

	return strings.Join(results, "; "), strings.Join(logs, "\n")
}

func (e *RuleEngine) executeAction(actType string, params map[string]interface{}, taskID string, ctx map[string]interface{}) (string, string) {
	switch actType {
	case "set_priority":
		priority, _ := params["priority"].(string)
		if priority == "" {
			return "skipped", "set_priority: missing priority"
		}
		_, err := e.DB.Exec(`UPDATE tasks SET priority = $1, updated_at = NOW() WHERE id = $2`, priority, taskID)
		if err != nil {
			return "failed", fmt.Sprintf("set_priority: %v", err)
		}
		if e.Hub != nil {
			e.Hub.SignalChange("tasks")
		}
		return "ok", fmt.Sprintf("set priority to %s", priority)

	case "set_status":
		status, _ := params["status"].(string)
		if status == "" {
			return "skipped", "set_status: missing status"
		}
		var completedAt interface{}
		if status == "done" {
			completedAt = time.Now()
		}
		_, err := e.DB.Exec(`UPDATE tasks SET status = $1, completed_at = $2, updated_at = NOW() WHERE id = $3`, status, completedAt, taskID)
		if err != nil {
			return "failed", fmt.Sprintf("set_status: %v", err)
		}
		if e.Hub != nil {
			e.Hub.SignalChange("tasks")
		}
		return "ok", fmt.Sprintf("set status to %s", status)

	case "assign_user":
		userID, _ := params["user_id"].(string)
		if userID == "" {
			return "skipped", "assign_user: missing user_id"
		}
		_, err := e.DB.Exec(
			`UPDATE tasks SET assignee_id = $1, assignee_type = 'user', updated_at = NOW() WHERE id = $2`, userID, taskID)
		if err != nil {
			return "failed", fmt.Sprintf("assign_user: %v", err)
		}
		if e.Hub != nil {
			e.Hub.SignalChange("tasks")
		}
		return "ok", fmt.Sprintf("assigned to user %s", userID)

	case "add_tag":
		tag, _ := params["tag"].(string)
		if tag == "" {
			return "skipped", "add_tag: missing tag"
		}
		_, err := e.DB.Exec(
			`INSERT INTO task_tags (task_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING`, taskID, tag)
		if err != nil {
			return "failed", fmt.Sprintf("add_tag: %v", err)
		}
		return "ok", fmt.Sprintf("added tag %s", tag)

	case "webhook":
		url, _ := params["url"].(string)
		if url == "" {
			return "skipped", "webhook: missing url"
		}
		// Fire-and-forget POST; non-blocking
		go func() {
			body := map[string]interface{}{
				"task_id": taskID,
				"type":    "rule_action",
				"params":  params,
			}
			b, _ := json.Marshal(body)
			http.Post(url, "application/json", strings.NewReader(string(b)))
		}()
		return "ok", fmt.Sprintf("webhook sent to %s", url)

	default:
		return "skipped", fmt.Sprintf("unknown action type: %s", actType)
	}
}

func (e *RuleEngine) logExecution(ruleID, taskID, triggerEvent string, matched bool, result, logMsg string) {
	id := uuid.New().String()
	now := time.Now()
	e.DB.Exec(
		`INSERT INTO task_rule_logs (id, rule_id, task_id, trigger_event, matched, result, log, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		id, ruleID, taskID, triggerEvent, matched, result, logMsg, now,
	)
}

// ===== CRUD Handler =====

type RuleHandler struct {
	DB  *sql.DB
	Hub *DashboardHub
}

func NewRuleHandler(db *sql.DB, hub *DashboardHub) *RuleHandler {
	return &RuleHandler{DB: db, Hub: hub}
}

// canManageRules checks if the user is admin/owner in the workspace.
func (h *RuleHandler) canManageRules(c *gin.Context) bool {
	return middleware.HasRole(c, "admin", "owner")
}

func (h *RuleHandler) List(c *gin.Context) {
	workspaceID := c.Query("workspace_id")
	isMember, _ := c.Get("is_workspace_member")

	query := `SELECT id, workspace_id, name, description, trigger_type, conditions, actions, enabled, created_by, created_at, updated_at
		FROM task_rules WHERE workspace_id = $1 ORDER BY created_at DESC`
	args := []interface{}{workspaceID}

	if !isMember.(bool) {
		userID, _ := c.Get("user_id")
		query = `SELECT id, workspace_id, name, description, trigger_type, conditions, actions, enabled, created_by, created_at, updated_at
			FROM task_rules WHERE created_by = $1 ORDER BY created_at DESC`
		args = []interface{}{userID}
	}

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query rules"})
		return
	}
	defer rows.Close()

	rules := make([]models.TaskRule, 0)
	for rows.Next() {
		var r models.TaskRule
		if err := rows.Scan(&r.ID, &r.WorkspaceID, &r.Name, &r.Description, &r.TriggerType,
			&r.Conditions, &r.Actions, &r.Enabled, &r.CreatedBy, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		rules = append(rules, r)
	}

	c.JSON(http.StatusOK, gin.H{"rules": rules})
}

func (h *RuleHandler) Get(c *gin.Context) {
	ruleID := c.Param("id")

	var r models.TaskRule
	err := h.DB.QueryRow(
		`SELECT id, workspace_id, name, description, trigger_type, conditions, actions, enabled, created_by, created_at, updated_at
		 FROM task_rules WHERE id = $1`, ruleID,
	).Scan(&r.ID, &r.WorkspaceID, &r.Name, &r.Description, &r.TriggerType,
		&r.Conditions, &r.Actions, &r.Enabled, &r.CreatedBy, &r.CreatedAt, &r.UpdatedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	c.JSON(http.StatusOK, r)
}

func (h *RuleHandler) Create(c *gin.Context) {
	if !h.canManageRules(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	workspaceID := c.Query("workspace_id")
	userID, _ := c.Get("user_id")

	var req models.CreateRuleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	validTriggers := map[string]bool{"on_comment": true, "on_status_change": true, "on_assignee_change": true, "on_task_create": true}
	if !validTriggers[req.TriggerType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid trigger_type"})
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	now := time.Now()
	ruleID := uuid.New().String()

	_, err := h.DB.Exec(
		`INSERT INTO task_rules (id, workspace_id, name, description, trigger_type, conditions, actions, enabled, created_by, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		ruleID, workspaceID, req.Name, req.Description, req.TriggerType,
		req.Conditions, req.Actions, enabled, userID, now, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create rule"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("task_rules")
	}

	c.JSON(http.StatusCreated, gin.H{"id": ruleID, "status": "created"})
}

func (h *RuleHandler) Update(c *gin.Context) {
	if !h.canManageRules(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	ruleID := c.Param("id")

	var req models.UpdateRuleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var sets []string
	var args []interface{}
	argIdx := 1

	if req.Name != nil {
		sets = append(sets, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, *req.Name)
		argIdx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *req.Description)
		argIdx++
	}
	if req.TriggerType != nil {
		sets = append(sets, fmt.Sprintf("trigger_type = $%d", argIdx))
		args = append(args, *req.TriggerType)
		argIdx++
	}
	if req.Conditions != nil {
		sets = append(sets, fmt.Sprintf("conditions = $%d", argIdx))
		args = append(args, *req.Conditions)
		argIdx++
	}
	if req.Actions != nil {
		sets = append(sets, fmt.Sprintf("actions = $%d", argIdx))
		args = append(args, *req.Actions)
		argIdx++
	}
	if req.Enabled != nil {
		sets = append(sets, fmt.Sprintf("enabled = $%d", argIdx))
		args = append(args, *req.Enabled)
		argIdx++
	}

	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}

	sets = append(sets, "updated_at = NOW()")
	args = append(args, ruleID)
	query := fmt.Sprintf("UPDATE task_rules SET %s WHERE id = $%d", strings.Join(sets, ", "), argIdx)

	result, err := h.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update rule"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("task_rules")
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (h *RuleHandler) Delete(c *gin.Context) {
	if !h.canManageRules(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	ruleID := c.Param("id")

	result, err := h.DB.Exec(`DELETE FROM task_rules WHERE id = $1`, ruleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete rule"})
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}

	if h.Hub != nil {
		h.Hub.SignalChange("task_rules")
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *RuleHandler) ListLogs(c *gin.Context) {
	ruleID := c.Param("id")

	rows, err := h.DB.Query(
		`SELECT id, rule_id, task_id, trigger_event, matched, result, log, created_at
		 FROM task_rule_logs WHERE rule_id = $1 ORDER BY created_at DESC LIMIT 100`, ruleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query logs"})
		return
	}
	defer rows.Close()

	logs := make([]models.TaskRuleLog, 0)
	for rows.Next() {
		var l models.TaskRuleLog
		if err := rows.Scan(&l.ID, &l.RuleID, &l.TaskID, &l.TriggerEvent, &l.Matched, &l.Result, &l.Log, &l.CreatedAt); err != nil {
			continue
		}
		logs = append(logs, l)
	}

	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// ===== Integration helpers for task handlers =====

// ExtractRuleContext builds context from comment content.
func ExtractCommentContext(taskID, content string) map[string]interface{} {
	return map[string]interface{}{
		"comment_content": content,
		"task_id":         taskID,
	}
}

// ExtractStatusContext builds context from status change.
func ExtractStatusContext(taskID, newStatus string) map[string]interface{} {
	return map[string]interface{}{
		"task_id": taskID,
		"status":  newStatus,
	}
}

// ExtractAssigneeContext builds context from assignee change.
func ExtractAssigneeContext(taskID, assigneeID, assigneeType string) map[string]interface{} {
	return map[string]interface{}{
		"task_id":       taskID,
		"assignee_id":   assigneeID,
		"assignee_type": assigneeType,
	}
}

// ExtractTaskContext builds context from task creation.
func ExtractTaskContext(taskID, title, assigneeID, assigneeType string) map[string]interface{} {
	return map[string]interface{}{
		"task_id":       taskID,
		"title":         title,
		"assignee_id":   assigneeID,
		"assignee_type": assigneeType,
	}
}
