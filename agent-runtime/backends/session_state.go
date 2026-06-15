package backends

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"time"
)

// WorkspaceBaseDir is set by the runtime at startup to the directory
// containing the agent-runtime binary. All workspace directories are
// created relative to this path, not the current working directory.
var WorkspaceBaseDir string

// SessionState persists claude session metadata alongside the workspace.
// It serves as the recovery key: without it, agent-runtime cannot find
// the claude native session to --resume after a restart.
type SessionState struct {
	SessionID       string `json:"session_id"`
	TaskID          string `json:"task_id"`
	AgentProfileID  string `json:"agent_profile_id"`
	QueueID         string `json:"queue_id"`
	ClaudeSessionID string `json:"claude_native_session_id,omitempty"`
	Status          string `json:"status"` // "active", "completed"
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

// SessionFileName is the name of the session state file in each workspace.
const SessionFileName = ".session.json"

func sessionFilePath(wsDir string) string {
	return filepath.Join(wsDir, SessionFileName)
}

// WriteSessionState writes the session state to a workspace directory.
func WriteSessionState(wsDir string, state *SessionState) error {
	state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(sessionFilePath(wsDir), data, 0644)
}

// ReadSessionState reads the session state from a workspace directory.
func ReadSessionState(wsDir string) (*SessionState, error) {
	data, err := os.ReadFile(sessionFilePath(wsDir))
	if err != nil {
		return nil, err
	}
	var state SessionState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

// DeleteSessionState removes the session state file from a workspace directory.
func DeleteSessionState(wsDir string) {
	path := sessionFilePath(wsDir)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		log.Printf("[SessionState] Failed to remove %s: %v", path, err)
	}
}

// WorkspaceDir returns the workspace directory path for a task+agent pair.
func WorkspaceDir(taskID, profileID string) string {
	if len(taskID) < 8 || len(profileID) < 8 {
		return ""
	}
	return filepath.Join(WorkspaceBaseDir, "workspaces", taskID[:8]+"-"+profileID[:8])
}

// WorkspaceKey returns the workspace directory key for a task+agent pair.
func WorkspaceKey(taskID, profileID string) string {
	if len(taskID) < 8 || len(profileID) < 8 {
		return ""
	}
	return taskID[:8] + "-" + profileID[:8]
}
