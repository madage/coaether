package harness

import (
	"database/sql"
	"log"
	"time"
)

// SafetyGuard monitors system-wide safety metrics and prevents runaway execution.
// It periodically checks for:
// - Tasks stuck in in_progress beyond the timeout
// - Workflows exceeding their token budget
type SafetyGuard struct {
	DB *sql.DB
}

// NewSafetyGuard creates a new SafetyGuard.
func NewSafetyGuard(db *sql.DB) *SafetyGuard {
	return &SafetyGuard{DB: db}
}

// StartPeriodicCheck starts a background goroutine that runs safety checks at the given interval.
func (sg *SafetyGuard) StartPeriodicCheck(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			sg.runChecks()
		}
	}()
	log.Printf("[SafetyGuard] Periodic checks started (interval=%v)", interval)
}

func (sg *SafetyGuard) runChecks() {
	sg.checkStuckTasks()
	sg.checkWorkflowBudgets()
}

// checkStuckTasks marks tasks as stuck if they've been in_progress for too long.
func (sg *SafetyGuard) checkStuckTasks() {
	timeout := 30 * time.Minute
	cutoff := time.Now().Add(-timeout)

	rows, err := sg.DB.Query(
		`SELECT id, agent_loop_count, max_agent_loops FROM tasks
		 WHERE status = 'in_progress' AND updated_at < $1 AND deleted_at IS NULL`,
		cutoff,
	)
	if err != nil {
		return
	}
	defer rows.Close()

	now := time.Now()
	for rows.Next() {
		var id string
		var loopCount, maxLoops int
		if err := rows.Scan(&id, &loopCount, &maxLoops); err != nil {
			continue
		}
		sg.DB.Exec(
			`UPDATE tasks SET status = 'stuck', updated_at = $1 WHERE id = $2 AND status = 'in_progress'`,
			now, id,
		)
		log.Printf("[SafetyGuard] Task %s marked stuck (in_progress > %v)", id[:8], timeout)
	}
}

// checkWorkflowBudgets pauses workflows that exceeded their token budget.
func (sg *SafetyGuard) checkWorkflowBudgets() {
	rows, err := sg.DB.Query(
		`SELECT id, title FROM workflows
		 WHERE status = 'active' AND token_budget > 0 AND tokens_used >= token_budget`,
	)
	if err != nil {
		return
	}
	defer rows.Close()

	now := time.Now()
	for rows.Next() {
		var id, title string
		if err := rows.Scan(&id, &title); err != nil {
			continue
		}
		sg.DB.Exec(
			`UPDATE workflows SET status = 'stuck', updated_at = $1 WHERE id = $2`,
			now, id,
		)
		log.Printf("[SafetyGuard] Workflow %s (%s) budget exceeded, marked stuck", id[:8], title)
	}
}
