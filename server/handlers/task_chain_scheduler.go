package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/coaether/server/protocol"
	"github.com/google/uuid"
)

// TriggerSource identifies what triggered a dispatch request.
type TriggerSource string

const (
	TriggerDAGComplete    TriggerSource = "dag_complete"
	TriggerMention        TriggerSource = "mention"
	TriggerReviewApproved TriggerSource = "review_approved"
	TriggerStateChange    TriggerSource = "state_change"
)

// DispatchDecision is the result of a dispatch evaluation.
type DispatchDecision struct {
	Allowed      bool
	Reason       string
	TargetTaskID string
}

// TriggerRequest carries all context for a dispatch request.
type TriggerRequest struct {
	Source          TriggerSource
	FromTaskID      string
	TargetAgentID   string
	TargetAgentName string
	CommentContent  string
	CommentID       string
	ActorID         string
}

// TaskChainScheduler is the unified entry point for all task dispatch and comment sync.
type TaskChainScheduler struct {
	DB          *sql.DB
	Bus         *protocol.MessageBus
	Hub         *DashboardHub
	DAGEngine   *DAGEngine
	TaskService *TaskService
	Notifier    *NotificationHandler
}

// NewTaskChainScheduler creates a new scheduler.
func NewTaskChainScheduler(db *sql.DB, bus *protocol.MessageBus, hub *DashboardHub,
	dag *DAGEngine, ts *TaskService, notif *NotificationHandler) *TaskChainScheduler {
	return &TaskChainScheduler{
		DB:          db,
		Bus:         bus,
		Hub:         hub,
		DAGEngine:   dag,
		TaskService: ts,
		Notifier:    notif,
	}
}

// Trigger is the single entry point for all dispatch requests.
func (s *TaskChainScheduler) Trigger(req TriggerRequest) error {
	switch req.Source {
	case TriggerDAGComplete:
		return s.handleDAGComplete(req)
	case TriggerMention:
		return s.handleMention(req)
	case TriggerStateChange:
		return s.handleStateChange(req)
	case TriggerReviewApproved:
		return s.handleDAGComplete(req)
	default:
		return fmt.Errorf("unknown trigger source: %s", req.Source)
	}
}

// handleDAGComplete handles automatic chain advancement when a task completes.
func (s *TaskChainScheduler) handleDAGComplete(req TriggerRequest) error {
	taskID := req.FromTaskID
	toUnblock, parentID, parentHasPlan := s.DAGEngine.gatherDAGTransitions(taskID)

	for _, tid := range toUnblock {
		if err := s.TaskService.MarkTodo(tid, TransitionOpts{
			ActorID: "",
			Comment: "所有前置依赖已完成，自动解除阻塞",
		}); err != nil {
			log.Printf("[Scheduler] Failed to unblock task %s: %v", safe8(tid), err)
		} else {
			log.Printf("[Scheduler] Task %s unblocked via DAG", safe8(tid))
			s.notifyParentProgress(tid, parentID, "dag_unblock", req.FromTaskID)
		}
	}

	if parentID != "" && s.TaskService != nil {
		if parentHasPlan {
			s.TaskService.MarkReview(parentID, TransitionOpts{
				ActorID: "",
				Comment: "所有子任务已完成，等待人工审核父任务",
			})
		} else {
			s.TaskService.MarkDone(parentID, TransitionOpts{
				ActorID: "",
				Comment: "所有子任务已完成，自动关闭",
			})
		}
	}

	return nil
}

// handleMention handles @mention-based dispatch with smart routing.
func (s *TaskChainScheduler) handleMention(req TriggerRequest) error {
	// Step 1: Route to the correct target task
	targetTaskID := s.RouteToTarget(req.FromTaskID, req.TargetAgentID)

	// Step 2: Read task snapshot for state validation
	var status, assigneeType, assigneeID, parentID, title string
	err := s.DB.QueryRow(
		`SELECT status, COALESCE(assignee_type,''), COALESCE(assignee_id,''),
			COALESCE(parent_id,''), title
		 FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
		targetTaskID,
	).Scan(&status, &assigneeType, &assigneeID, &parentID, &title)
	if err != nil {
		return fmt.Errorf("target task not found: %w", err)
	}

	// Step 3: State-based dispatch decision
	switch status {
	case "blocked":
		// Check if all dependencies are met
		if !s.allDepsDone(targetTaskID) {
			blockers := s.getBlockers(targetTaskID)
			reason := fmt.Sprintf("任务「%s」依赖尚未完成: %s", title, blockers)
			log.Printf("[Scheduler] Blocked dispatch: %s", reason)
			s.notifyParentProgress(targetTaskID, parentID, "mention_blocked", req.FromTaskID)
			return fmt.Errorf("%s", reason)
		}
		// Dependencies met, unblock first then dispatch below
		s.TaskService.MarkTodo(targetTaskID, TransitionOpts{
			ActorID: req.ActorID,
			Comment: "通过@提及手动解除阻塞",
		})

	case "done":
		return fmt.Errorf("任务「%s」已完成", title)
	}

	// Step 4: Dispatch to target task
	s.dispatchToTask(targetTaskID, req)

	// Step 5: Comment sync
	if targetTaskID != req.FromTaskID {
		s.notifyParentProgress(targetTaskID, parentID, "mention_routed", req.FromTaskID)
	}

	return nil
}

// handleStateChange handles manual state-change dispatch (todo→in_progress, blocked→todo, etc.)
func (s *TaskChainScheduler) handleStateChange(req TriggerRequest) error {
	s.dispatchToTask(req.FromTaskID, req)
	return nil
}

// RouteToTarget determines the correct target task for an @mention.
func (s *TaskChainScheduler) RouteToTarget(fromTaskID, targetAgentID string) string {
	// Rule 1: current task's assignee matches → stay on current task
	var currentAssignee string
	s.DB.QueryRow(
		`SELECT COALESCE(assignee_id,'') FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
		fromTaskID,
	).Scan(&currentAssignee)
	if currentAssignee == targetAgentID {
		return fromTaskID
	}

	// Rule 2: find matching direct child task
	rows, err := s.DB.Query(
		`SELECT id, status FROM tasks
		 WHERE parent_id = $1 AND assignee_id = $2 AND deleted_at IS NULL AND status != 'done'
		 ORDER BY CASE status WHEN 'blocked' THEN 0 WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END
		 LIMIT 1`,
		fromTaskID, targetAgentID,
	)
	if err == nil {
		defer rows.Close()
		if rows.Next() {
			var childID, childStatus string
			rows.Scan(&childID, &childStatus)
			log.Printf("[Scheduler] RouteToTarget: routed to child task %s (status=%s)", safe8(childID), childStatus)
			return childID
		}
	}

	// Rule 3: check parent task's assignee
	var parentID, parentAssignee string
	s.DB.QueryRow(
		`SELECT t.parent_id, COALESCE(pt.assignee_id,'') FROM tasks t
		 LEFT JOIN tasks pt ON pt.id = t.parent_id AND pt.deleted_at IS NULL
		 WHERE t.id = $1 AND t.deleted_at IS NULL`,
		fromTaskID,
	).Scan(&parentID, &parentAssignee)
	if parentAssignee == targetAgentID && parentID != "" {
		log.Printf("[Scheduler] RouteToTarget: routed to parent task %s", safe8(parentID))
		return parentID
	}

	// Rule 4: fallback to current task
	return fromTaskID
}

// dispatchToTask creates a queue entry for the target task+agent.
func (s *TaskChainScheduler) dispatchToTask(taskID string, req TriggerRequest) {
	var assigneeType, assigneeID string
	err := s.DB.QueryRow(
		`SELECT COALESCE(assignee_type,''), COALESCE(assignee_id,'') FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
		taskID,
	).Scan(&assigneeType, &assigneeID)
	if err != nil || assigneeType != "agent_profile" || assigneeID == "" {
		return
	}

	// Dedup: skip if already queued
	var existingID string
	dupErr := s.DB.QueryRow(
		`SELECT id FROM task_agent_queue WHERE task_id = $1 AND agent_profile_id = $2 AND status IN ('queued', 'claimed', 'processing') LIMIT 1`,
		taskID, assigneeID,
	).Scan(&existingID)

	now := time.Now()
	queueID := existingID
	if dupErr != nil {
		queueID = uuid.New().String()
		triggerType := "status_change"
		if req.Source == TriggerMention {
			triggerType = "mention"
		}
		s.DB.Exec(
			`INSERT INTO task_agent_queue (id, task_id, agent_profile_id, status, trigger_type, assigned_at, created_at)
			 VALUES ($1, $2, $3, 'queued', $4, $5, $5)`,
			queueID, taskID, assigneeID, triggerType, now,
		)
		s.DB.Exec(`UPDATE agent_profiles SET current_load = current_load + 1, last_active_at = $1 WHERE id = $2`,
			now, assigneeID)
		log.Printf("[Scheduler] Dispatched task %s to agent %s (queue=%s, trigger=%s)",
			safe8(taskID), safe8(assigneeID), safe8(queueID), triggerType)
	} else {
		log.Printf("[Scheduler] Task %s already queued for agent %s (queue=%s), sending mention event",
			safe8(taskID), safe8(assigneeID), safe8(existingID))
	}

	if s.Hub != nil {
		s.Hub.SignalChange("task_agent_queue")
	}

	// Send MessageBus event for instant notification (mention scenarios)
	if s.Bus != nil && req.Source == TriggerMention {
		s.sendMentionEvent(taskID, assigneeID, queueID, req)
	}
}

// sendMentionEvent sends a MsgAgentMention to the runtime via MessageBus.
func (s *TaskChainScheduler) sendMentionEvent(taskID, agentID, queueID string, req TriggerRequest) {
	var nodeID, sysPrompt, instructions, taskTitle string
	s.DB.QueryRow(
		`SELECT node_id, COALESCE(system_prompt,''), COALESCE(instructions,'') FROM agent_profiles WHERE id = $1 AND enabled = true`,
		agentID,
	).Scan(&nodeID, &sysPrompt, &instructions)
	if nodeID == "" {
		return
	}
	s.DB.QueryRow(`SELECT title FROM tasks WHERE id = $1`, taskID).Scan(&taskTitle)

	var agentCommentCount int
	s.DB.QueryRow(
		`SELECT COUNT(*) FROM task_comments WHERE task_id = $1 AND agent_profile_id = $2 AND is_agent_comment = true`,
		taskID, agentID,
	).Scan(&agentCommentCount)

	runtimeEndpoint := "runtime://" + nodeID
	mentionEnv := protocol.NewEnvelope("system://api", runtimeEndpoint, protocol.MsgAgentMention,
		&protocol.Payload{
			Metadata: map[string]any{
				"task_id":             taskID,
				"task_title":          taskTitle,
				"queue_id":            queueID,
				"comment_id":          req.CommentID,
				"comment_content":     req.CommentContent,
				"agent_profile_id":    agentID,
				"system_prompt":       sysPrompt,
				"instructions":        instructions,
				"agent_comment_count": agentCommentCount,
			},
		},
	)
	s.Bus.Deliver(mentionEnv)
	log.Printf("[Scheduler] Sent MsgAgentMention to %s for agent %s", runtimeEndpoint, safe8(agentID))
}

// allDepsDone checks whether all dependencies of a task are done or in review.
func (s *TaskChainScheduler) allDepsDone(taskID string) bool {
	var allDone bool
	s.DB.QueryRow(
		`SELECT COUNT(*) = 0 FROM task_dependencies td
		 JOIN tasks t ON t.id = td.depends_on_id
		 WHERE td.task_id = $1
		   AND t.deleted_at IS NULL AND t.status NOT IN ('done', 'review')`,
		taskID,
	).Scan(&allDone)
	return allDone
}

// getBlockers returns a human-readable list of blocking tasks.
func (s *TaskChainScheduler) getBlockers(taskID string) string {
	rows, _ := s.DB.Query(
		`SELECT t.title FROM task_dependencies td
		 JOIN tasks t ON t.id = td.depends_on_id
		 WHERE td.task_id = $1 AND t.deleted_at IS NULL AND t.status NOT IN ('done', 'review')`,
		taskID,
	)
	defer rows.Close()
	var titles []string
	for rows.Next() {
		var t string
		rows.Scan(&t)
		titles = append(titles, "「"+t+"」")
	}
	if len(titles) == 0 {
		return "未知依赖"
	}
	result := ""
	for i, t := range titles {
		if i > 0 {
			result += "、"
		}
		result += t
	}
	return result
}

// notifyParentProgress posts a progress comment on the parent task.
func (s *TaskChainScheduler) notifyParentProgress(taskID, parentID, eventType, fromTaskID string) {
	if parentID == "" {
		return
	}

	var taskTitle string
	s.DB.QueryRow(`SELECT title FROM tasks WHERE id = $1`, taskID).Scan(&taskTitle)

	comment := s.buildProgressComment(taskID, eventType, fromTaskID)

	commentID := uuid.New().String()
	now := time.Now()
	s.DB.Exec(
		`INSERT INTO task_comments (id, task_id, user_id, agent_profile_id, content, is_agent_comment, created_at, updated_at)
		 VALUES ($1, $2, '', '', $3, true, $4, $4)`,
		commentID, parentID, comment, now,
	)
	_ = taskTitle
	log.Printf("[Scheduler] Parent progress comment posted: parent=%s event=%s", safe8(parentID), eventType)
}

// buildProgressComment generates the progress message for different event types.
func (s *TaskChainScheduler) buildProgressComment(taskID, eventType, fromTaskID string) string {
	var taskTitle string
	s.DB.QueryRow(`SELECT title FROM tasks WHERE id = $1`, taskID).Scan(&taskTitle)
	title := "「" + taskTitle + "」"

	switch eventType {
	case "dag_unblock":
		return fmt.Sprintf("✅ %s 已完成，下游任务已自动解除阻塞", title)
	case "mention_routed":
		return fmt.Sprintf("用户 @提及 → 已派发到子任务 %s", title)
	case "mention_blocked":
		return fmt.Sprintf("用户 @提及 %s，但该任务依赖尚未完成，暂时无法派发", title)
	default:
		return fmt.Sprintf("%s 状态更新", title)
	}
}
