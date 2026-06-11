package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

var cstZone = time.FixedZone("CST", 8*3600)

func formatTime(t time.Time) string {
	// DB stores timestamp without time zone in CST; Go reads it as UTC.
	// Reinterpret the same wall-clock time with CST zone for RFC3339 output.
	cst := time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), cstZone)
	return cst.Format(time.RFC3339)
}

type LogHandler struct {
	DB *sql.DB
}

func NewLogHandler(db *sql.DB) *LogHandler {
	return &LogHandler{DB: db}
}

type paginatedResp struct {
	Items interface{} `json:"items"`
	Total int         `json:"total"`
	Page  int         `json:"page"`
	Size  int         `json:"size"`
}

func parsePage(c *gin.Context) (page, size, offset int) {
	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ = strconv.Atoi(c.DefaultQuery("size", "30"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 200 {
		size = 30
	}
	offset = (page - 1) * size
	return
}

// ========== Agent Tool Logs ==========

type agentToolLogItem struct {
	ID         string  `json:"id"`
	AgentID    string  `json:"agent_id"`
	AgentName  string  `json:"agent_name"`
	WorkflowID *string `json:"workflow_id"`
	TaskID     *string `json:"task_id"`
	ToolName   string  `json:"tool_name"`
	Parameters string  `json:"parameters"`
	Status     string  `json:"status"`
	DenyReason string  `json:"deny_reason"`
	CreatedAt  string  `json:"created_at"`
}

func (h *LogHandler) AgentToolLogs(c *gin.Context) {
	page, size, offset := parsePage(c)

	var total int
	h.DB.QueryRow(`SELECT COUNT(*) FROM agent_tool_logs`).Scan(&total)

	rows, err := h.DB.Query(
		`SELECT l.id, l.agent_id, COALESCE(p.name, ''), l.workflow_id, l.task_id,
			l.tool_name, l.parameters::text, l.status, COALESCE(l.deny_reason, ''), l.created_at
		 FROM agent_tool_logs l
		 LEFT JOIN agent_profiles p ON l.agent_id = p.id
		 ORDER BY l.created_at DESC LIMIT $1 OFFSET $2`, size, offset,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	defer rows.Close()

	items := make([]agentToolLogItem, 0)
	for rows.Next() {
		var it agentToolLogItem
		var t time.Time
		if err := rows.Scan(&it.ID, &it.AgentID, &it.AgentName, &it.WorkflowID, &it.TaskID,
			&it.ToolName, &it.Parameters, &it.Status, &it.DenyReason, &t); err != nil {
			continue
		}
		it.CreatedAt = formatTime(t)
		items = append(items, it)
	}
	c.JSON(http.StatusOK, paginatedResp{Items: items, Total: total, Page: page, Size: size})
}

// ========== Access Logs ==========

type accessLogItem struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
	Method    string `json:"method"`
	Path      string `json:"path"`
	Status    int    `json:"status"`
	LatencyMs int    `json:"latency_ms"`
	ClientIP  string `json:"client_ip"`
	CreatedAt string `json:"created_at"`
}

func (h *LogHandler) AccessLogs(c *gin.Context) {
	page, size, offset := parsePage(c)

	pathFilter := c.Query("path")

	var total int
	var rows *sql.Rows
	var err error

	if pathFilter != "" {
		h.DB.QueryRow(`SELECT COUNT(*) FROM access_logs WHERE path ILIKE $1`, "%"+pathFilter+"%").Scan(&total)
		rows, err = h.DB.Query(
			`SELECT id, COALESCE(user_id,''), username, method, path, status, latency_ms, client_ip, created_at
			 FROM access_logs WHERE path ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
			"%"+pathFilter+"%", size, offset,
		)
	} else {
		h.DB.QueryRow(`SELECT COUNT(*) FROM access_logs`).Scan(&total)
		rows, err = h.DB.Query(
			`SELECT id, COALESCE(user_id,''), username, method, path, status, latency_ms, client_ip, created_at
			 FROM access_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`, size, offset,
		)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	defer rows.Close()

	items := make([]accessLogItem, 0)
	for rows.Next() {
		var it accessLogItem
		var t time.Time
		if err := rows.Scan(&it.ID, &it.UserID, &it.Username, &it.Method, &it.Path, &it.Status, &it.LatencyMs, &it.ClientIP, &t); err != nil {
			continue
		}
		it.CreatedAt = formatTime(t)
		items = append(items, it)
	}
	c.JSON(http.StatusOK, paginatedResp{Items: items, Total: total, Page: page, Size: size})
}

// ========== Token Usage ==========

type tokenUsageItem struct {
	ID               string  `json:"id"`
	WorkflowID       *string `json:"workflow_id"`
	TaskID           *string `json:"task_id"`
	AgentProfileID   *string `json:"agent_profile_id"`
	AgentName        string  `json:"agent_name"`
	SessionID        *string `json:"session_id"`
	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	TotalTokens      int     `json:"total_tokens"`
	Stage            string  `json:"stage"`
	CreatedAt        string  `json:"created_at"`
}

func (h *LogHandler) TokenUsage(c *gin.Context) {
	page, size, offset := parsePage(c)

	var total int
	h.DB.QueryRow(`SELECT COUNT(*) FROM token_usage`).Scan(&total)

	rows, err := h.DB.Query(
		`SELECT t.id, t.workflow_id, t.task_id, t.agent_profile_id, COALESCE(p.name,''),
			t.session_id, t.prompt_tokens, t.completion_tokens, t.total_tokens, t.stage, t.created_at
		 FROM token_usage t
		 LEFT JOIN agent_profiles p ON t.agent_profile_id = p.id
		 ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`, size, offset,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}
	defer rows.Close()

	items := make([]tokenUsageItem, 0)
	for rows.Next() {
		var it tokenUsageItem
		var t time.Time
		if err := rows.Scan(&it.ID, &it.WorkflowID, &it.TaskID, &it.AgentProfileID, &it.AgentName,
			&it.SessionID, &it.PromptTokens, &it.CompletionTokens, &it.TotalTokens, &it.Stage, &t); err != nil {
			continue
		}
		it.CreatedAt = formatTime(t)
		items = append(items, it)
	}
	c.JSON(http.StatusOK, paginatedResp{Items: items, Total: total, Page: page, Size: size})
}

// ========== System Events (workflow_escalations UNION task_reviews UNION app_events) ==========

type systemEventItem struct {
	ID        string `json:"id"`
	EventType string `json:"event_type"`
	Source    string `json:"source"`
	Title     string `json:"title"`
	Detail    string `json:"detail"`
	CreatedAt string `json:"created_at"`
}

func (h *LogHandler) SystemEvents(c *gin.Context) {
	page, size, offset := parsePage(c)

	var eCount, rCount, aCount int
	h.DB.QueryRow(`SELECT COUNT(*) FROM workflow_escalations`).Scan(&eCount)
	h.DB.QueryRow(`SELECT COUNT(*) FROM task_reviews`).Scan(&rCount)
	h.DB.QueryRow(`SELECT COUNT(*) FROM app_events`).Scan(&aCount)
	total := eCount + rCount + aCount

	items := make([]systemEventItem, 0, size)

	// Query escalations
	eLimit := size / 3
	if eLimit < 1 {
		eLimit = size / 2
	}
	eOffset := offset / 3
	eRows, err := h.DB.Query(
		`SELECT id, workflow_id, task_id, level, trigger_reason, action_taken, created_at
		 FROM workflow_escalations ORDER BY created_at DESC LIMIT $1 OFFSET $2`, eLimit, eOffset,
	)
	if err == nil {
		defer eRows.Close()
		for eRows.Next() {
			var id, reason, action string
			var wfID, taskID *string
			var level int
			var t time.Time
			if err := eRows.Scan(&id, &wfID, &taskID, &level, &reason, &action, &t); err != nil {
				continue
			}
			items = append(items, systemEventItem{
				ID: id, EventType: "escalation", Source: "workflow",
				Title:     "工作流熔断 L" + strconv.Itoa(level),
				Detail:    reason + " → " + action,
				CreatedAt: formatTime(t),
			})
		}
	}

	// Query task reviews
	rLimit := size - len(items)
	if rLimit < 1 {
		rLimit = size / 3
	}
	rOffset := offset / 3
	rRows, err := h.DB.Query(
		`SELECT r.id, r.task_id, r.action, COALESCE(r.comment,''), COALESCE(u.username,''), r.created_at
		 FROM task_reviews r LEFT JOIN users u ON r.reviewer_id = u.id
		 ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`, rLimit, rOffset,
	)
	if err == nil {
		defer rRows.Close()
		for rRows.Next() {
			var id, action, comment, reviewer string
			var taskID *string
			var t time.Time
			if err := rRows.Scan(&id, &taskID, &action, &comment, &reviewer, &t); err != nil {
				continue
			}
			items = append(items, systemEventItem{
				ID: id, EventType: "review", Source: "review",
				Title:     "任务" + action,
				Detail:    comment + " | 审核人:" + reviewer,
				CreatedAt: formatTime(t),
			})
		}
	}

	// Query app events
	aLimit := size - len(items)
	if aLimit < 1 {
		aLimit = size / 3
	}
	aOffset := offset / 3
	aRows, err := h.DB.Query(
		`SELECT id, event_type, source, title, detail, COALESCE(task_id,''), COALESCE(agent_id,''), created_at
		 FROM app_events ORDER BY created_at DESC LIMIT $1 OFFSET $2`, aLimit, aOffset,
	)
	if err == nil {
		defer aRows.Close()
		for aRows.Next() {
			var id, evtType, source, title, detail, tID, aID string
			var t time.Time
			if err := aRows.Scan(&id, &evtType, &source, &title, &detail, &tID, &aID, &t); err != nil {
				continue
			}
			items = append(items, systemEventItem{
				ID: id, EventType: evtType, Source: source,
				Title:     title,
				Detail:    detail,
				CreatedAt: formatTime(t),
			})
		}
	}

	c.JSON(http.StatusOK, paginatedResp{Items: items, Total: total, Page: page, Size: size})
}

func truncateID(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
