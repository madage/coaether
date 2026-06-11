package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/coaether/server/harness"
	"github.com/coaether/server/models"
)

// ReviewRouter routes completed tasks to the correct reviewer
// and handles review results with loop control and meltdown logic.
type ReviewRouter struct {
	DB          *sql.DB
	Hub         *DashboardHub
	DAGEngine   *DAGEngine
	Notifier    *NotificationHandler
	Auditor      *harness.Auditor
	TaskService  *TaskService
}

// NewReviewRouter creates a new review router.
func NewReviewRouter(db *sql.DB) *ReviewRouter {
	return &ReviewRouter{
		DB:        db,
		DAGEngine: NewDAGEngine(db),
		Auditor:   harness.NewAuditor(db),
	}
}

// ReviewAction represents a review decision.
type ReviewAction string

const (
	ReviewApproved ReviewAction = "approved"
	ReviewRejected ReviewAction = "rejected"
)

// RouteTask determines the path for a completed task based on completion_behavior.
// Called when a task transitions to "completed".
func (r *ReviewRouter) RouteTask(taskID string) {
	// Delegate to TaskService for unified completion routing.
	// Completion routing is now handled automatically by
	// TaskService.TransitionStatus when tasks reach "completed".
	if r.TaskService == nil {
		log.Printf("[ReviewRouter] TaskService not available for RouteTask")
		return
	}

	var status, behavior, assigneeType, assigneeID, workflowID string
	err := r.DB.QueryRow(
		`SELECT status, COALESCE(completion_behavior, 'auto_done'),
		        COALESCE(assignee_type, ''), COALESCE(assignee_id, ''),
		        COALESCE(workflow_id, '')
		 FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
		taskID,
	).Scan(&status, &behavior, &assigneeType, &assigneeID, &workflowID)
	if err != nil {
		log.Printf("[ReviewRouter] Task %s not found: %v", safe8(taskID), err)
		return
	}

	if status != "completed" {
		return
	}

	opts := TransitionOpts{}

	switch behavior {
	case models.CompletionAutoDone:
		r.TaskService.MarkDone(taskID, opts)
	case models.CompletionAutoReview:
		// createReviewQueue is still needed for agent-to-agent review dispatch
		if assigneeType == "agent_profile" && assigneeID != "" {
			r.createReviewQueue(taskID, assigneeID, workflowID)
		} else {
			r.TaskService.MarkReview(taskID, opts)
		}
	case models.CompletionSampleReview:
		sampleRate := 0.2
		if workflowID != "" {
			r.DB.QueryRow(
				`SELECT COALESCE(ap.review_sample_rate, 0.2) FROM agent_profiles ap
				 JOIN tasks t ON t.assignee_id = ap.id
				 WHERE t.id = $1`, taskID,
			).Scan(&sampleRate)
		}
		if rand.Float64() < sampleRate {
			r.TaskService.MarkReview(taskID, opts)
		} else {
			r.TaskService.MarkDone(taskID, opts)
		}
	case models.CompletionNeedsReview:
		r.TaskService.MarkReview(taskID, opts)
	default:
		r.TaskService.MarkReview(taskID, opts)
	}
}

// HandleReview processes a review action (approved/rejected).
func (r *ReviewRouter) HandleReview(taskID string, reviewerID *string, reviewerAgentID *string,
	action ReviewAction, comment string) error {

	// Validate action before delegating
	if action != ReviewApproved && action != ReviewRejected {
		return fmt.Errorf("invalid action: %s", action)
	}

	if r.TaskService == nil {
		return fmt.Errorf("TaskService not available")
	}

	return r.TaskService.HandleReview(taskID, reviewerID, reviewerAgentID, string(action), comment)
}

// processPendingActions processes pending_review_actions when a task is approved.
// It creates queue entries for sub-tasks or task assignments that were gated
// behind human review when an agent tried to dispatch to another agent.
func (r *ReviewRouter) processPendingActions(taskID string) {
	var rawActions []byte
	err := r.DB.QueryRow(
		`SELECT pending_review_actions FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
		taskID,
	).Scan(&rawActions)
	if err != nil {
		return
	}

	var actions []struct {
		Type            string `json:"type"`
		SubTaskID       string `json:"sub_task_id"`
		TargetAgentID   string `json:"target_agent_id"`
		Title           string `json:"title"`
		TargetAgentName string `json:"target_agent_name"`
	}
	if err := json.Unmarshal(rawActions, &actions); err != nil || len(actions) == 0 {
		return
	}

	now := time.Now()
	for _, a := range actions {
		switch a.Type {
		case "create_sub_task":
			if a.SubTaskID == "" || a.TargetAgentID == "" {
				continue
			}
			queueID := uuid.New().String()
			r.DB.Exec(
				`INSERT INTO task_agent_queue (id, task_id, agent_profile_id, status, trigger_type, assigned_at, created_at)
				 VALUES ($1, $2, $3, 'queued', 'sub_task', $4, $4)`,
				queueID, a.SubTaskID, a.TargetAgentID, now,
			)
			r.DB.Exec(`UPDATE agent_profiles SET current_load = current_load + 1 WHERE id = $1`, a.TargetAgentID)
			log.Printf("[ReviewRouter] Approved: queued subtask %s for agent %s", a.SubTaskID[:8], a.TargetAgentID[:8])

		case "assign_task":
			if a.TargetAgentID == "" {
				continue
			}
			queueID := uuid.New().String()
			r.DB.Exec(
				`INSERT INTO task_agent_queue (id, task_id, agent_profile_id, status, trigger_type, assigned_at, created_at)
				 VALUES ($1, $2, $3, 'queued', 'assigned', $4, $4)`,
				queueID, taskID, a.TargetAgentID, now,
			)
			r.DB.Exec(`UPDATE agent_profiles SET current_load = current_load + 1 WHERE id = $1`, a.TargetAgentID)
			log.Printf("[ReviewRouter] Approved: queued task %s for assigned agent %s", taskID[:8], a.TargetAgentID[:8])
		}
	}

	// Clear pending actions
	r.DB.Exec(`UPDATE tasks SET pending_review_actions = '[]'::jsonb WHERE id = $1`, taskID)

	// Clear source agent's assignee on this task — review approved,
	// the originating agent is no longer responsible.
	var curAssigneeID, curAssigneeType string
	r.DB.QueryRow(
		`SELECT COALESCE(assignee_id,''), COALESCE(assignee_type,'') FROM tasks WHERE id = $1`,
		taskID,
	).Scan(&curAssigneeID, &curAssigneeType)
	if curAssigneeType == "agent_profile" {
		r.DB.Exec(`UPDATE tasks SET assignee_id = NULL, assignee_type = NULL, updated_at = $1 WHERE id = $2`, now, taskID)
	}

	// Cancel any remaining active queue entries for this task
	r.DB.Exec(`UPDATE task_agent_queue SET status = 'failed', completed_at = $1
		WHERE task_id = $2 AND status IN ('queued', 'claimed', 'processing')`, now, taskID)

	if r.Hub != nil {
		r.Hub.SignalChange("task_agent_queue")
	}
}

// HandleReviewHTTP handles review submissions via HTTP API.
func (r *ReviewRouter) HandleReviewHTTP(c *gin.Context) {
	taskID := c.Param("id")

	var req struct {
		Action          string  `json:"action" binding:"required"`
		Comment         string  `json:"comment"`
		ReviewerAgentID *string `json:"reviewer_agent_id,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	action := ReviewAction(req.Action)
	if action != ReviewApproved && action != ReviewRejected {
		c.JSON(http.StatusBadRequest, gin.H{"error": "action must be 'approved' or 'rejected'"})
		return
	}

	userID, _ := c.Get("user_id")
	userIDStr, _ := userID.(string)

	err := r.HandleReview(taskID, &userIDStr, req.ReviewerAgentID, action, req.Comment)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": string(action)})
}

// createReviewQueue creates a queue entry for an agent to review a task.
func (r *ReviewRouter) createReviewQueue(taskID, agentProfileID, workflowID string) {
	// Skip if agent is disabled
	var enabled bool
	r.DB.QueryRow(`SELECT enabled FROM agent_profiles WHERE id = $1`, agentProfileID).Scan(&enabled)
	if !enabled {
		return
	}

	existingStatus := ""
	r.DB.QueryRow(
		`SELECT status FROM task_agent_queue
		 WHERE task_id = $1 AND agent_profile_id = $2 AND status IN ('queued', 'claimed', 'processing')`,
		taskID, agentProfileID,
	).Scan(&existingStatus)

	if existingStatus != "" {
		return // Already has an active queue entry
	}

	queueID := uuid.New().String()
	now := time.Now()

	r.DB.Exec(
		`INSERT INTO task_agent_queue (id, task_id, agent_profile_id, status, trigger_type, assigned_at, created_at)
		 VALUES ($1, $2, $3, 'queued', 'review', $4, $4)`,
		queueID, taskID, agentProfileID, now,
	)
	r.DB.Exec(`UPDATE agent_profiles SET current_load = current_load + 1, last_active_at = $1 WHERE id = $2`,
		now, agentProfileID)

	if r.Hub != nil {
		r.Hub.SignalChange("task_agent_queue")
	}
}

// notifyWorkspace sends a notification to workspace members about a review task.
func (r *ReviewRouter) notifyWorkspace(taskID, notifType, title string) {
	if r.Notifier == nil || r.DB == nil {
		return
	}

	// Find the workspace owner/admins
	var workspaceID string
	r.DB.QueryRow(
		`SELECT workspace_id FROM tasks WHERE id = $1`, taskID,
	).Scan(&workspaceID)
	if workspaceID == "" {
		return
	}

	rows, err := r.DB.Query(
		`SELECT user_id FROM workspace_members
		 WHERE workspace_id = $1 AND role IN ('owner', 'admin')
		 LIMIT 5`,
		workspaceID,
	)
	if err != nil {
		return
	}
	defer rows.Close()

	var titleText string
	r.DB.QueryRow(`SELECT title FROM tasks WHERE id = $1`, taskID).Scan(&titleText)

	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		r.Notifier.Create(userID, notifType, fmt.Sprintf("审核: %s", titleText),
			fmt.Sprintf("任务「%s」等待审核", titleText), &taskID)
	}
}

// notifyStuck sends meltdown notifications to workspace admins.
func (r *ReviewRouter) notifyStuck(taskID, workflowID string, loopCount, maxLoops int) {
	if r.Notifier == nil || r.DB == nil {
		return
	}

	var title, workspaceID string
	r.DB.QueryRow(`SELECT title, workspace_id FROM tasks WHERE id = $1`, taskID).Scan(&title, &workspaceID)

	// Notify workspace admins
	rows, err := r.DB.Query(
		`SELECT user_id FROM workspace_members
		 WHERE workspace_id = $1 AND role IN ('owner', 'admin')`,
		workspaceID,
	)
	if err != nil {
		return
	}
	defer rows.Close()

	msg := fmt.Sprintf("任务「%s」已被打回 %d 次（上限 %d 次），已熔断，需人工介入", title, loopCount, maxLoops)
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		r.Notifier.Create(userID, "workflow_stuck", fmt.Sprintf("工作流熔断: %s", title), msg, &taskID)
	}

	// If this is a workflow task, also log the escalation
	if workflowID != "" {
		escID := uuid.New().String()
		now := time.Now()
		r.DB.Exec(
			`INSERT INTO workflow_escalations (id, workflow_id, task_id, level, trigger_reason, action_taken, created_at)
			 VALUES ($1, $2, $3, 4, 'loop_exceeded', $4, $5)`,
			escID, workflowID, taskID,
			fmt.Sprintf("任务打回 %d/%d 次后熔断", loopCount, maxLoops),
			now,
		)
	}
}

// auditReview writes a review action to the audit log.
func (r *ReviewRouter) auditReview(taskID string, agentID *string, action, comment string) {
	if agentID == nil || *agentID == "" {
		return
	}
	params, _ := json.Marshal(map[string]string{
		"task_id": taskID,
		"action":  action,
		"comment": comment,
	})
	r.Auditor.LogSimple(*agentID, "review_task", params, "allowed", "")
}
