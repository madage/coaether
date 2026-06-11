package handlers

import (
	"database/sql"
	"log"

	"github.com/google/uuid"
)

// InsertAppEvent writes an operational event into app_events for UI visibility.
// eventType: "error", "warning", "info"
func InsertAppEvent(db *sql.DB, eventType, source, title, detail, taskID, agentID string) {
	id := uuid.New().String()
	var tID, aID interface{}
	if taskID != "" {
		tID = taskID
	}
	if agentID != "" {
		aID = agentID
	}
	if _, err := db.Exec(
		`INSERT INTO app_events (id, event_type, source, title, detail, task_id, agent_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
		id, eventType, source, title, detail, tID, aID,
	); err != nil {
		log.Printf("[AppEvent] Failed to write event: %v", err)
	}
}
