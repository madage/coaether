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
	Auditor     *harness.Auditor
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
	var status, behavior, assigneeType, assigneeID, workflowID string
	err := r.DB.QueryRow(
		`SELECT status, COALESCE(completion_behavior, 'auto_done'),
		        COALESCE(assignee_type, ''), COALESCE(assignee_id, ''),
		        COALESCE(workflow_id, '')
		 FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
		taskID,
	).Scan(&status, &behavior, &assigneeType, &assigneeID, &workflowID)
	if err != nil {
		log.Printf("[ReviewRouter] Task %s not found: %v", taskID[:8], err)
		return
	}

	// Only route tasks in "completed" status
	if status != "completed" {
		return
	}

	now := time.Now()

	switch behavior {
	case models.CompletionAutoDone:
		// Skip review, go straight to done
		r.DB.Exec(`UPDATE tasks SET status = 'done', completed_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
			now, taskID)
		log.Printf("[ReviewRouter] Auto-done task %s", taskID[:8])

		// Trigger DAG advancement
		if workflowID != "" {
			r.DAGEngine.OnTaskCompleted(taskID)
		}

	case models.CompletionAutoReview:
		// Route to the task's assignee if it's an agent_profile
		if assigneeType == "agent_profile" && assigneeID != "" {
			r.createReviewQueue(taskID, assigneeID, workflowID)
		} else {
			// Fallback: needs human review
			r.DB.Exec(`UPDATE tasks SET status = 'review', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
				now, taskID)
			r.notifyWorkspace(taskID, "task_needs_review", "任务等待审核")
		}

	case models.CompletionSampleReview:
		// Random sampling
		sampleRate := 0.2 // default 20%
		if workflowID != "" {
			r.DB.QueryRow(
				`SELECT COALESCE(ap.review_sample_rate, 0.2) FROM agent_profiles ap
				 JOIN tasks t ON t.assignee_id = ap.id
				 WHERE t.id = $1`, taskID,
			).Scan(&sampleRate)
		}
		if rand.Float64() < sampleRate {
			// Selected for review
			r.DB.Exec(`UPDATE tasks SET status = 'review', updated_at = $1 WHERE id = $2`,
				now, taskID)
			r.notifyWorkspace(taskID, "task_needs_review", "任务被抽检，等待审核")
		} else {
			// Skip review
			r.DB.Exec(`UPDATE tasks SET status = 'done', completed_at = $1, updated_at = $1 WHERE id = $2`,
				now, taskID)
			if workflowID != "" {
				r.DAGEngine.OnTaskCompleted(taskID)
			}
		}

	case models.CompletionNeedsReview:
		// Always require human review
		r.DB.Exec(`UPDATE tasks SET status = 'review', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
			now, taskID)
		r.notifyWorkspace(taskID, "task_needs_review", "任务完成，等待审核")

	default:
		// Unknown behavior, default to needs_review
		r.DB.Exec(`UPDATE tasks SET status = 'review', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
			now, taskID)
	}
}

// HandleReview processes a review action (approved/rejected).
func (r *ReviewRouter) HandleReview(taskID string, reviewerID *string, reviewerAgentID *string,
	action ReviewAction, comment string) error {

	// Get current task state
	var currentStatus, behavior, workflowID string
	var loopCount, maxLoops int
	err := r.DB.QueryRow(
		`SELECT status, COALESCE(completion_behavior, 'auto_done'),
		        COALESCE(workflow_id, ''), agent_loop_count, max_agent_loops
		 FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
		taskID,
	).Scan(&currentStatus, &behavior, &workflowID, &loopCount, &maxLoops)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	if currentStatus != "review" {
		return fmt.Errorf("task is not in review status (current: %s)", currentStatus)
	}

	// Record the review
	reviewID := uuid.New().String()
	now := time.Now()
	r.DB.Exec(
		`INSERT INTO task_reviews (id, task_id, reviewer_id, reviewer_agent_id, action, comment, loop_count, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		reviewID, taskID, reviewerID, reviewerAgentID, string(action), comment, loopCount+1, now,
	)

	switch action {
	case ReviewApproved:
		// Mark as done
		r.DB.Exec(`UPDATE tasks SET status = 'done', completed_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
			now, taskID)
		log.Printf("[ReviewRouter] Task %s approved", taskID[:8])

		// Process any pending dispatch actions (create_sub_task, assign_task)
		r.processPendingActions(taskID)

		// Record in audit log
		r.auditReview(taskID, reviewerAgentID, "approved", comment)

		// Trigger DAG advancement (always, even for sub-tasks without workflow_id)
			r.DAGEngine.OnTaskCompleted(taskID)

	case ReviewRejected:
		newLoopCount := loopCount + 1

		if newLoopCount >= maxLoops {
			// Meltdown! Loop count exceeded
			r.DB.Exec(`UPDATE tasks SET status = 'stuck', agent_loop_count = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
				newLoopCount, now, taskID)
			log.Printf("[ReviewRouter] Task %s STUCK after %d loops (max %d)", taskID[:8], newLoopCount, maxLoops)

			// Notify workspace admins
			r.notifyStuck(taskID, workflowID, newLoopCount, maxLoops)

			// Record in audit log
			r.auditReview(taskID, reviewerAgentID, "meltdown",
				fmt.Sprintf("打回 %d 次（上限 %d 次），已熔断", newLoopCount, maxLoops))
		} else {
			// Send back for rework
			r.DB.Exec(`UPDATE tasks SET status = 'in_progress', agent_loop_count = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
				newLoopCount, now, taskID)
			log.Printf("[ReviewRouter] Task %s rejected, rework loop %d/%d", taskID[:8], newLoopCount, maxLoops)

			// Record in audit log
			r.auditReview(taskID, reviewerAgentID, "rejected", comment)

			// If assigned to an agent, re-create the queue entry
			var assigneeID, assigneeType string
			r.DB.QueryRow(
				`SELECT COALESCE(assignee_id,''), COALESCE(assignee_type,'') FROM tasks WHERE id = $1`,
				taskID,
			).Scan(&assigneeID, &assigneeType)
			if assigneeType == "agent_profile" && assigneeID != "" {
				r.createReviewQueue(taskID, assigneeID, workflowID)
			}
		}
	}

	if r.Hub != nil {
		r.Hub.SignalChange("tasks")
	}

	return nil
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
