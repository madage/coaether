package handlers

import (
	"database/sql"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

// DAGEngine manages task dependencies for workflow execution.
// It tracks which tasks depend on which, and advances blocked tasks
// when their dependencies complete.
type DAGEngine struct {
	DB          *sql.DB
	mu          sync.Mutex
	Hub         *DashboardHub // optional, for real-time updates
	TaskService *TaskService // unified status transition (set after creation)
	processing  sync.Map     // re-entrancy guard: tracks tasks currently being advanced
}

// NewDAGEngine creates a new DAG engine.
func NewDAGEngine(db *sql.DB) *DAGEngine {
	return &DAGEngine{DB: db}
}

// CreateDependency records a dependency between two tasks.
func (e *DAGEngine) CreateDependency(taskID, dependsOnID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	id := uuid.New().String()
	now := time.Now()

	// Prevent self-dependency
	if taskID == dependsOnID {
		return nil
	}

	_, err := e.DB.Exec(
		`INSERT INTO task_dependencies (id, task_id, depends_on_id, created_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (task_id, depends_on_id) DO NOTHING`,
		id, taskID, dependsOnID, now,
	)
	return err
}

// WouldCreateCycle checks if adding a dependency would create a cycle.
// Uses DFS from the target task to see if we can reach the source task.
func (e *DAGEngine) WouldCreateCycle(workflowID, taskID, dependsOnID string) (bool, error) {
	if taskID == dependsOnID {
		return true, nil
	}

	// Build adjacency list (depends_on_id → [task_id, ...])
	// i.e., if task B depends on A, then graph[A] = [B]
	rows, err := e.DB.Query(
		`SELECT task_id, depends_on_id
		 FROM task_dependencies td
		 JOIN tasks t ON t.id = td.task_id
		 WHERE t.workflow_id = $1 AND t.deleted_at IS NULL`,
		workflowID,
	)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	graph := make(map[string][]string)
	for rows.Next() {
		var tid, depID string
		if err := rows.Scan(&tid, &depID); err != nil {
			continue
		}
		graph[depID] = append(graph[depID], tid)
	}

	// Temporarily add the proposed edge
	graph[dependsOnID] = append(graph[dependsOnID], taskID)

	// DFS from dependsOnID to see if we can reach taskID
	visited := make(map[string]bool)
	var dfs func(string) bool
	dfs = func(node string) bool {
		if node == taskID && visited[node] {
			return true // cycle found
		}
		if visited[node] {
			return false
		}
		visited[node] = true
		for _, next := range graph[node] {
			if dfs(next) {
				return true
			}
		}
		delete(visited, node) // backtrack
		return false
	}

	return dfs(dependsOnID), nil
}

// OnTaskCompleted is called when a task transitions to "done" or "review"
// (both indicate the work is complete and downstream tasks can proceed).
// It checks all tasks that depend on the completed task,
// transitions them from "blocked" to "todo" if all dependencies are met,
// auto-dispatches unblocked agent tasks to the queue,
// and auto-closes the parent task when all sub-tasks are done.
func (e *DAGEngine) OnTaskCompleted(taskID string) {
	// Re-entrancy guard: if a task is already being processed (cycle or deep recursion),
	// skip it to prevent infinite loops.
	if _, loaded := e.processing.LoadOrStore(taskID, struct{}{}); loaded {
		log.Printf("[DAGEngine] Task %s is already being processed — possible cycle, skipping", taskID[:8])
		return
	}
	defer e.processing.Delete(taskID)

	toUnblock, parentID, parentHasPlan := e.gatherDAGTransitions(taskID)

	// Apply transitions outside the lock via TaskService to avoid deadlock
	// from recursive DAG advancement callbacks.
	for _, tid := range toUnblock {
		if e.TaskService != nil {
			if err := e.TaskService.MarkTodo(tid, TransitionOpts{
				ActorID: "",
				Comment: "所有前置依赖已完成，自动解除阻塞",
			}); err != nil {
				log.Printf("[DAGEngine] Failed to unblock task %s: %v", tid[:8], err)
			} else {
				log.Printf("[DAGEngine] Task %s unblocked via TaskService", tid[:8])
			}
		} else {
			// Fallback: direct DB write (should not happen in production)
			now := time.Now()
			e.DB.Exec(`UPDATE tasks SET status = 'todo', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`, now, tid)
		}
	}

	if parentID != "" && e.TaskService != nil {
		if parentHasPlan {
			e.TaskService.MarkReview(parentID, TransitionOpts{
				ActorID: "",
				Comment: "所有子任务已完成，等待人工审核父任务",
			})
		} else {
			e.TaskService.MarkDone(parentID, TransitionOpts{
				ActorID: "",
				Comment: "所有子任务已完成，自动关闭",
			})
		}
	}
}

// gatherDAGTransitions collects the IDs that need to transition based on the DAG state.
// Must NOT call any TaskService methods — only reads DB and returns lists.
func (e *DAGEngine) gatherDAGTransitions(taskID string) (toUnblock []string, parentID string, parentHasPlan bool) {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := time.Now()

	// Find all tasks that depend on this task
	rows, err := e.DB.Query(
		`SELECT td.task_id, t.workflow_id
		 FROM task_dependencies td
		 JOIN tasks t ON t.id = td.task_id
		 WHERE td.depends_on_id = $1
		   AND t.deleted_at IS NULL
		   AND t.status = 'blocked'`,
		taskID,
	)
	if err != nil {
		log.Printf("[DAGEngine] Query error: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var dependentID, wfID string
		if err := rows.Scan(&dependentID, &wfID); err != nil {
			continue
		}

		// Check if ALL dependencies are done or in review (work product is ready)
		var allDone bool
		e.DB.QueryRow(
			`SELECT COUNT(*) = 0 FROM task_dependencies td
			 JOIN tasks t ON t.id = td.depends_on_id
			 WHERE td.task_id = $1
			   AND (t.deleted_at IS NULL AND t.status NOT IN ('done', 'review'))`,
			dependentID,
		).Scan(&allDone)

		if allDone {
			toUnblock = append(toUnblock, dependentID)
			_ = wfID // used for logging in caller
		}
	}

	// Check if parent can be auto-closed
	parentID, parentHasPlan = e.checkParentAutoCloseLocked(taskID, now)
	return
}

// checkParentAutoCloseLocked determines if the parent task can be auto-closed.
func (e *DAGEngine) checkParentAutoCloseLocked(taskID string, now time.Time) (string, bool) {
	var parentID string
	err := e.DB.QueryRow(`SELECT COALESCE(parent_id,'') FROM tasks WHERE id = $1 AND deleted_at IS NULL`, taskID).Scan(&parentID)
	if err != nil || parentID == "" {
		return "", false
	}

	// Check if all siblings are done (or in review, meaning work is complete awaiting sign-off)
	var allDone bool
	e.DB.QueryRow(
		`SELECT COUNT(*) = 0 FROM tasks WHERE parent_id = $1 AND deleted_at IS NULL AND status NOT IN ('done', 'review')`,
		parentID,
	).Scan(&allDone)

	if !allDone {
		return "", false
	}

	// Only close if parent is not already done or in review
	var parentStatus string
	e.DB.QueryRow(`SELECT status FROM tasks WHERE id = $1 AND deleted_at IS NULL`, parentID).Scan(&parentStatus)
	if parentStatus == "done" || parentStatus == "review" {
		return "", false
	}

	// Check if parent has an approved decomposition plan
	var hasPlan bool
	e.DB.QueryRow(
		`SELECT COUNT(*) > 0 FROM decomposition_plans
		 WHERE task_id = $1 AND status = 'approved'`,
		parentID,
	).Scan(&hasPlan)

	return parentID, hasPlan
}

// tryAutoDispatchLocked creates a queue entry for an unblocked task with an agent_profile assignee.
func (e *DAGEngine) tryAutoDispatchLocked(taskID string, now time.Time) {
	var assigneeType, assigneeID, taskStatus string
	err := e.DB.QueryRow(
		`SELECT COALESCE(assignee_type,''), COALESCE(assignee_id,''), status FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
		taskID,
	).Scan(&assigneeType, &assigneeID, &taskStatus)
	if err != nil || assigneeType != "agent_profile" || assigneeID == "" {
		return
	}

	// Never dispatch blocked tasks — they have unmet dependencies
	if taskStatus == "blocked" {
		log.Printf("[DAGEngine] Skipping dispatch of blocked task %s", taskID[:8])
		return
	}

	// Check if already queued for this task+agent (deduplication)
	var existingID string
	err = e.DB.QueryRow(
		`SELECT id FROM task_agent_queue WHERE task_id = $1 AND agent_profile_id = $2 AND status IN ('queued', 'claimed', 'processing') LIMIT 1`,
		taskID, assigneeID,
	).Scan(&existingID)
	if err == nil {
		log.Printf("[DAGEngine] Task %s already queued for agent %s (queue=%s), skipping", taskID[:8], assigneeID[:8], existingID[:8])
		return
	}

	// Check agent capacity
	var canProcess bool
	e.DB.QueryRow(
		`SELECT COALESCE(current_load, 0) < COALESCE(max_concurrency, 1) FROM agent_profiles WHERE id = $1 AND enabled = true`,
		assigneeID,
	).Scan(&canProcess)
	if !canProcess {
		return
	}

	queueID := uuid.New().String()
	e.DB.Exec(
		`INSERT INTO task_agent_queue (id, task_id, agent_profile_id, status, trigger_type, assigned_at, created_at)
		 VALUES ($1, $2, $3, 'queued', 'status_change', $4, $4)`,
		queueID, taskID, assigneeID, now,
	)
	e.DB.Exec(`UPDATE agent_profiles SET current_load = current_load + 1, last_active_at = $1 WHERE id = $2`,
		now, assigneeID)
	log.Printf("[DAGEngine] Auto-dispatched task %s to agent %s (queue=%s)", taskID[:8], assigneeID[:8], queueID[:8])
}


// SetTaskBlocked marks a task as blocked if it has unmet dependencies.
func (e *DAGEngine) SetTaskBlocked(taskID string) {
	var depCount int
	e.DB.QueryRow(
		`SELECT COUNT(*) FROM task_dependencies WHERE task_id = $1`, taskID,
	).Scan(&depCount)

	if depCount > 0 {
		now := time.Now()
		e.DB.Exec(
			`UPDATE tasks SET status = 'blocked', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL AND status = 'todo'`,
			now, taskID,
		)
	}
}

// GetDependencies returns the list of task IDs that the given task depends on.
func (e *DAGEngine) GetDependencies(taskID string) ([]string, error) {
	rows, err := e.DB.Query(
		`SELECT depends_on_id FROM task_dependencies WHERE task_id = $1`,
		taskID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deps []string
	for rows.Next() {
		var depID string
		if err := rows.Scan(&depID); err != nil {
			continue
		}
		deps = append(deps, depID)
	}
	return deps, nil
}

// GetDependents returns the list of task IDs that depend on the given task.
func (e *DAGEngine) GetDependents(taskID string) ([]string, error) {
	rows, err := e.DB.Query(
		`SELECT task_id FROM task_dependencies WHERE depends_on_id = $1`,
		taskID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deps []string
	for rows.Next() {
		var depID string
		if err := rows.Scan(&depID); err != nil {
			continue
		}
		deps = append(deps, depID)
	}
	return deps, nil
}

// RemoveDependency removes a single dependency record.
func (e *DAGEngine) RemoveDependency(taskID, dependsOnID string) error {
	_, err := e.DB.Exec(
		`DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2`,
		taskID, dependsOnID,
	)
	return err
}
