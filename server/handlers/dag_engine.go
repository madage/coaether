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
	DB  *sql.DB
	mu  sync.Mutex
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

// OnTaskCompleted is called when a task transitions to "done".
// It checks all tasks that depend on the completed task and
// transitions them from "blocked" to "todo" if all dependencies are met.
func (e *DAGEngine) OnTaskCompleted(taskID string) {
	e.mu.Lock()
	defer e.mu.Unlock()

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

	now := time.Now()
	for rows.Next() {
		var dependentID, wfID string
		if err := rows.Scan(&dependentID, &wfID); err != nil {
			continue
		}

		// Check if ALL dependencies of this task are done
		allDone := false
		e.DB.QueryRow(
			`SELECT COUNT(*) = 0 FROM task_dependencies td
			 JOIN tasks t ON t.id = td.depends_on_id
			 WHERE td.task_id = $1
			   AND (t.status != 'done' OR t.deleted_at IS NOT NULL)`,
			dependentID,
		).Scan(&allDone)

		if allDone {
			_, err := e.DB.Exec(
				`UPDATE tasks SET status = 'todo', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
				now, dependentID,
			)
			if err != nil {
				log.Printf("[DAGEngine] Failed to unblock task %s: %v", dependentID, err)
			} else {
				log.Printf("[DAGEngine] Task %s unblocked (all dependencies met in workflow %s)", dependentID[:8], wfID[:8])
			}
		}
	}
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
