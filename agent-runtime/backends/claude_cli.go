package backends

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/coaether/server/protocol"
)

// OnSessionComplete is called when a claude process finishes with a result event.
type OnSessionComplete func(sessionID string, result string, stopReason string, isError bool)

// ClaudeCLIBackend manages persistent claude subprocesses via stream-json protocol.
type ClaudeCLIBackend struct {
	command       string
	timeout       time.Duration
	sessions      map[string]*claudeSession
	sendFunc      func(*protocol.Envelope)
	onComplete    OnSessionComplete
	serverURL      string
	nodeID         string
	nodeSecret     string
	mcpServerPath  string
	maxTurns       int               // --max-turns for Claude CLI sessions (0 = default 100)
	resumeSessions map[string]string // workspaceKey → last claudeSessionID for --resume
	mu             sync.Mutex
}

func (b *ClaudeCLIBackend) SetOnSessionComplete(fn OnSessionComplete) {
	b.onComplete = fn
}

// SetRuntimeConfig sets the runtime connection info needed by the MCP server.
func (b *ClaudeCLIBackend) SetRuntimeConfig(serverURL, nodeID, nodeSecret, mcpServerPath string) {
	b.serverURL = serverURL
	b.nodeID = nodeID
	b.nodeSecret = nodeSecret
	b.mcpServerPath = mcpServerPath
}

type claudeSession struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	cancel context.CancelFunc

	mu           sync.Mutex
	model        string
	sessionID    string
	lastActivity time.Time
	completed    bool
	// Session context for MCP tool routing
	taskID    string
	queueID   string
	profileID string
	claudeSessionID string // Claude's native session_id for --resume across rounds
}

func (s *claudeSession) setCompleted() {
	s.mu.Lock()
	s.completed = true
	s.mu.Unlock()
}

func (s *claudeSession) isCompleted() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.completed
}

func NewClaudeCLIBackend(cmdPath string) *ClaudeCLIBackend {
	if cmdPath == "" {
		cmdPath = "claude"
	}
	if _, err := exec.LookPath(cmdPath); err != nil {
		log.Printf("[ClaudeCLI] Command not found: %s", cmdPath)
		return nil
	}
	return &ClaudeCLIBackend{
		command:        cmdPath,
		timeout:        30 * time.Minute,
		sessions:       make(map[string]*claudeSession),
		resumeSessions: make(map[string]string),
	}
}

func (b *ClaudeCLIBackend) SetSendFunc(fn func(*protocol.Envelope)) {
	b.sendFunc = fn
}

// RestoreResumeSession rebuilds a resume mapping after restart from persisted state.
func (b *ClaudeCLIBackend) RestoreResumeSession(wsKey, claudeSessionID string) {
	b.mu.Lock()
	b.resumeSessions[wsKey] = claudeSessionID
	b.mu.Unlock()
}

func (b *ClaudeCLIBackend) Name() string    { return "Claude Code" }
func (b *ClaudeCLIBackend) Version() string { return "stream-json" }

func (b *ClaudeCLIBackend) HandleMessage(env *protocol.Envelope) (*protocol.Envelope, error) {
	if env.Payload == nil {
		return nil, nil
	}
	userText := extractText(env.Payload.Content)
	if userText == "" {
		return nil, nil
	}
	sessionID := env.SessionID
	if sessionID == "" {
		return nil, nil
	}

	b.mu.Lock()
	sess, exists := b.sessions[sessionID]
	if !exists {
		// Extract session context from metadata for MCP tool routing
		taskID, _ := getMetaStr(env.Payload.Metadata, "task_id")
		queueID, _ := getMetaStr(env.Payload.Metadata, "queue_id")
		profileID, _ := getMetaStr(env.Payload.Metadata, "agent_profile_id")

		// Compute workspace key and lookup --resume session while holding b.mu
		var wsKey string
		if taskID == "" || profileID == "" {
			wsKey = sessionID
		} else {
			wsKey = taskID[:8] + "-" + profileID[:8]
		}
		prevClaudeID := b.resumeSessions[wsKey]

		sess = b.startSession(sessionID, taskID, queueID, profileID, wsKey, prevClaudeID)
		if sess == nil {
			b.mu.Unlock()
			return protocol.NewEnvelope("", "", protocol.MsgError,
				&protocol.Payload{Code: "SESSION_ERROR", Message: "failed to start claude process"},
			), nil
		}
		b.sessions[sessionID] = sess
	}
	b.mu.Unlock()

	go b.processMessage(sess, env, userText)
	return nil, nil
}

// ---- JSON stream event types ----

type streamJSONEvent struct {
	Type    string           `json:"type"`
	Subtype string           `json:"subtype"`
	Message *json.RawMessage `json:"message,omitempty"`
	Result  string           `json:"result,omitempty"`
	IsError bool             `json:"is_error,omitempty"`

	DurationMs   int            `json:"duration_ms,omitempty"`
	TotalCostUSD float64        `json:"total_cost_usd,omitempty"`
	Usage        map[string]any `json:"usage,omitempty"`
	StopReason   string         `json:"stop_reason,omitempty"`
	SessionID    string         `json:"session_id,omitempty"`

	// Permission event fields
	ApprovalID string           `json:"approval_id,omitempty"`
	ToolName   string           `json:"tool_name,omitempty"`
	Tool       *json.RawMessage `json:"tool,omitempty"`
	PromptText string           `json:"prompt_text,omitempty"`
	Input      *json.RawMessage `json:"input,omitempty"`
}

type assistantMessage struct {
	ID      string                   `json:"id,omitempty"`
	Role    string                   `json:"role,omitempty"`
	Model   string                   `json:"model,omitempty"`
	Content []assistantContentBlock  `json:"content"`
}

type assistantContentBlock struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Thinking string `json:"thinking,omitempty"`
	ID       string `json:"id,omitempty"`
	Name     string `json:"name,omitempty"`
	Input    any    `json:"input,omitempty"`
}

// ---- session lifecycle ----

func (b *ClaudeCLIBackend) startSession(sessionID, taskID, queueID, profileID, wsKey, prevClaudeID string) *claudeSession {
	ctx, cancel := context.WithCancel(context.Background())

	args := []string{
		"-p",
		"--output-format", "stream-json",
		"--input-format", "stream-json",
		"--verbose",
		"--permission-mode", "bypassPermissions",
		"--disallowedTools", "AskUserQuestion",
	}

	maxTurns := b.maxTurns
	if maxTurns <= 0 {
		maxTurns = 100
	}
	args = append(args, "--max-turns", fmt.Sprintf("%d", maxTurns))

	// Resume previous Claude session for the same task+agent if available
	if prevClaudeID != "" {
		args = append(args, "--resume", prevClaudeID)
		log.Printf("[ClaudeCLI] Resuming claude session %s for workspace %s", prevClaudeID[:8], wsKey)
	}

	cmd := exec.CommandContext(ctx, b.command, args...)
	cmd.Env = filterClaudeEnv(os.Environ())
	wsDir := filepath.Join(WorkspaceBaseDir, "workspaces", wsKey)
	if err := os.MkdirAll(wsDir, 0755); err != nil {
		log.Printf("[ClaudeCLI] Failed to create workspace %s: %v", wsDir, err)
	} else {
		cmd.Dir = wsDir

		// Write .mcp.json so Claude Code discovers the coaether harness tools
		if b.mcpServerPath != "" {
			mcpConfig := fmt.Sprintf(`{
  "mcpServers": {
    "coaether-harness": {
      "type": "stdio",
      "command": "%s",
      "env": {
        "COAETHER_SERVER_URL": "%s",
        "COAETHER_NODE_ID": "%s",
        "COAETHER_NODE_SECRET": "%s",
        "COAETHER_TASK_ID": "%s",
        "COAETHER_QUEUE_ID": "%s",
        "COAETHER_PROFILE_ID": "%s"
      }
    }
  }
}`, escJSON(b.mcpServerPath), escJSON(b.serverURL), escJSON(b.nodeID), escJSON(b.nodeSecret), escJSON(taskID), escJSON(queueID), escJSON(profileID))
			mcpPath := filepath.Join(wsDir, ".mcp.json")
			if err := os.WriteFile(mcpPath, []byte(mcpConfig), 0644); err != nil {
				log.Printf("[ClaudeCLI] Failed to write .mcp.json: %v", err)
			} else {
				log.Printf("[ClaudeCLI] Wrote MCP config for session %s", sessionID[:8])
			}
		}

		// Persist session state so agent-runtime can recover after restart
		if taskID != "" && profileID != "" {
			state := &SessionState{
				SessionID:      sessionID,
				TaskID:         taskID,
				AgentProfileID: profileID,
				QueueID:        queueID,
				Status:         "active",
				CreatedAt:      time.Now().UTC().Format(time.RFC3339),
			}
			if err := WriteSessionState(wsDir, state); err != nil {
				log.Printf("[ClaudeCLI] Failed to write session state: %v", err)
			} else {
				log.Printf("[ClaudeCLI] Wrote .session.json for workspace %s", wsKey)
			}
		}
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		log.Printf("[ClaudeCLI] StdinPipe: %v", err)
		cancel()
		return nil
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("[ClaudeCLI] StdoutPipe: %v", err)
		cancel()
		return nil
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		log.Printf("[ClaudeCLI] StderrPipe: %v", err)
		cancel()
		return nil
	}

	if err := cmd.Start(); err != nil {
		log.Printf("[ClaudeCLI] Start: %v", err)
		cancel()
		return nil
	}

	sid := sessionID
	if len(sid) > 8 {
		sid = sid[:8]
	}
	log.Printf("[ClaudeCLI] Started pid=%d for session %s", cmd.Process.Pid, sid)

	sess := &claudeSession{
		cmd:          cmd,
		stdin:        stdin,
		stdout:       stdout,
		cancel:       cancel,
		sessionID:    sessionID,
		lastActivity: time.Now(),
		taskID:       taskID,
		queueID:      queueID,
		profileID:    profileID,
	}

	// Stderr logging
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			log.Printf("[ClaudeCLI][%s][stderr] %s", sid, line)
		}
	}()

	// JSON stream parser
	go b.readStdout(sess, stdout)

	// Process monitor
	go func() {
		cmd.Wait()
		log.Printf("[ClaudeCLI] Process exited for session %s (pid=%d)", sid, cmd.Process.Pid)
		// Clean up session map if still present (may already be cleaned by readStdout)
		b.mu.Lock()
		if _, exists := b.sessions[sess.sessionID]; exists {
			if !sess.isCompleted() && b.onComplete != nil {
				b.onComplete(sess.sessionID, "", "crash", true)
			}
			delete(b.sessions, sess.sessionID)
		}
		b.mu.Unlock()
	}()

	return sess
}

func (b *ClaudeCLIBackend) readStdout(sess *claudeSession, stdout io.Reader) {
	sid := sess.sessionID
	if len(sid) > 8 {
		sid = sid[:8]
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var evt streamJSONEvent
		if err := json.Unmarshal([]byte(line), &evt); err != nil {
			log.Printf("[ClaudeCLI][%s] Parse error: %v", sid, err)
			continue
		}

		sess.updateActivity()

		switch evt.Type {
		case "system":
			b.handleSystemEvent(sess, line)
		case "assistant":
			b.handleAssistantEvent(sess, &evt)
		case "result":
			b.handleResultEvent(sess, &evt)
		case "permission":
			b.handlePermissionEvent(sess, &evt)
		case "control_request":
			b.handleControlRequestAuto(sess, line)
		case "user":
			b.handleUserEvent(sess, line)
		default:
			log.Printf("[ClaudeCLI][%s] Unhandled: %s", sid, evt.Type)
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("[ClaudeCLI][%s] Scan error: %v", sid, err)
	}

	// Fallback: if no result event was received (e.g., claude crashed), still notify
	if !sess.isCompleted() && b.onComplete != nil {
		log.Printf("[ClaudeCLI][%s] Session ended without result event", sid)
		b.onComplete(sess.sessionID, "", "error", true)
	}

	b.mu.Lock()
	delete(b.sessions, sess.sessionID)
	b.mu.Unlock()
}

// ---- event handlers ----

func (b *ClaudeCLIBackend) handleSystemEvent(sess *claudeSession, rawJSON string) {
	var raw struct {
		SessionID string `json:"session_id"`
		Model     string `json:"model"`
	}
	if json.Unmarshal([]byte(rawJSON), &raw) != nil {
		return
	}
	sess.mu.Lock()
	sess.model = raw.Model
	sess.claudeSessionID = raw.SessionID
	sess.mu.Unlock()

	// Store Claude session_id for --resume on next round (same task+agent)
	if sess.taskID != "" && sess.profileID != "" {
		wsKey := sess.taskID[:8] + "-" + sess.profileID[:8]
		b.mu.Lock()
		b.resumeSessions[wsKey] = raw.SessionID
		b.mu.Unlock()

		// Update on-disk session state with claude native session id
		wsDir := WorkspaceDir(sess.taskID, sess.profileID)
		if state, err := ReadSessionState(wsDir); err == nil {
			state.ClaudeSessionID = raw.SessionID
			if err := WriteSessionState(wsDir, state); err != nil {
				log.Printf("[ClaudeCLI] Failed to update session state: %v", err)
			}
		}
	}

	sid := sess.sessionID
	if len(sid) > 8 {
		sid = sid[:8]
	}
	log.Printf("[ClaudeCLI][%s] Init: model=%s claude_session=%s", sid, raw.Model, raw.SessionID[:8])
}

func sessionTo(to string) string {
	return "session://" + to
}

func (b *ClaudeCLIBackend) handleAssistantEvent(sess *claudeSession, evt *streamJSONEvent) {
	if evt.Message == nil {
		return
	}

	var msg assistantMessage
	if err := json.Unmarshal(*evt.Message, &msg); err != nil {
		sid := sess.sessionID
		if len(sid) > 8 {
			sid = sid[:8]
		}
		log.Printf("[ClaudeCLI][%s] Assistant parse: %v", sid, err)
		return
	}

	for _, block := range msg.Content {
		switch block.Type {
		case "thinking":
			b.sendToBus(protocol.NewEnvelope("", sessionTo(sess.sessionID), protocol.MsgEvent,
				&protocol.Payload{
					Content: []protocol.ContentBlock{
						protocol.ProgressBlock("thinking", block.Thinking),
					},
				}).WithSession(sess.sessionID))

		case "text":
			b.sendToBus(protocol.NewEnvelope("", sessionTo(sess.sessionID), protocol.MsgEvent,
				&protocol.Payload{
					Content: []protocol.ContentBlock{
						protocol.StatusBlock("claude", "green"),
						protocol.MarkdownBlock(block.Text),
					},
				}).WithSession(sess.sessionID))

		case "tool_use":
			inputJSON, _ := json.Marshal(block.Input)
			// Permission routing (consumed by runtime for approval flow)
			b.sendToBus(protocol.NewEnvelope("", sessionTo(sess.sessionID), protocol.MsgToolUse,
				&protocol.Payload{
					ToolUseID: block.ID,
					Tool:      block.Name,
					Input:     string(inputJSON),
				}).WithSession(sess.sessionID))
			// Display event (consumed by frontend for rendering)
			b.sendToBus(protocol.NewEnvelope("", sessionTo(sess.sessionID), protocol.MsgEvent,
				&protocol.Payload{
					Content: []protocol.ContentBlock{
						{
							Type:      "tool_use",
							Tool:      block.Name,
							ToolInput: string(inputJSON),
							Status:    "running",
						},
					},
				}).WithSession(sess.sessionID))
		}
	}
}

func (b *ClaudeCLIBackend) handleResultEvent(sess *claudeSession, evt *streamJSONEvent) {
	metadata := map[string]any{
		"duration_ms": evt.DurationMs,
		"total_cost":  evt.TotalCostUSD,
		"is_error":    evt.IsError,
		"stop_reason": evt.StopReason,
	}
	b.sendToBus(protocol.NewEnvelope("", sessionTo(sess.sessionID), protocol.MsgEvent,
		&protocol.Payload{
			Content: []protocol.ContentBlock{
				protocol.StatusBlock("done", "green"),
			},
			Metadata: metadata,
		}).WithSession(sess.sessionID))

	// Notify caller that this session's claude process completed
	sess.setCompleted()

	// Mark session state as completed on disk
	if sess.taskID != "" && sess.profileID != "" {
		wsDir := WorkspaceDir(sess.taskID, sess.profileID)
		if state, err := ReadSessionState(wsDir); err == nil {
			state.Status = "completed"
			if err := WriteSessionState(wsDir, state); err != nil {
				log.Printf("[ClaudeCLI] Failed to mark session completed: %v", err)
			}
		}
	}

	if b.onComplete != nil {
		b.onComplete(sess.sessionID, evt.Result, evt.StopReason, evt.IsError)
	}
}

func (b *ClaudeCLIBackend) handlePermissionEvent(sess *claudeSession, evt *streamJSONEvent) {
	var inputStr string
	if evt.Tool != nil {
		inputBytes, _ := json.Marshal(evt.Tool)
		inputStr = string(inputBytes)
	} else if evt.Input != nil {
		inputBytes, _ := json.Marshal(evt.Input)
		inputStr = string(inputBytes)
	}

	toolName := evt.ToolName
	if toolName == "" && evt.Tool != nil {
		var tool struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(*evt.Tool, &tool) == nil {
			toolName = tool.Name
		}
	}

	promptText := evt.PromptText
	if promptText == "" {
		promptText = "Allow this tool call?"
	}

	sid := sess.sessionID
	if len(sid) > 8 {
		sid = sid[:8]
	}
	log.Printf("[ClaudeCLI][%s] Permission request: %s (id=%s)", sid, toolName, evt.ApprovalID)

	b.sendToBus(protocol.NewEnvelope("", sessionTo(sess.sessionID), protocol.MsgPermissionRequest,
		&protocol.Payload{
			ToolUseID: evt.ApprovalID,
			Tool:      toolName,
			Input:     inputStr,
			Message:   promptText,
		}).WithSession(sess.sessionID))
}


// handleControlRequestAuto auto-approves all control_request events from Claude Code
// in daemon mode. With --permission-mode bypassPermissions, Claude Code auto-approves
// most tool calls internally, but certain boundary cases still emit control_request and
// require an explicit control_response on stdin. Without this handler the session would
// stall indefinitely. Pattern matches Multica's approach: parse request_id + input,
// respond with behavior="allow".
func (b *ClaudeCLIBackend) handleControlRequestAuto(sess *claudeSession, rawLine string) {
	var raw struct {
		RequestID string          `json:"request_id"`
		Request   json.RawMessage `json:"request"`
	}
	if err := json.Unmarshal([]byte(rawLine), &raw); err != nil {
		log.Printf("[ClaudeCLI][%s] ControlRequest parse error, cannot respond: %v", sess.sessionID[:8], err)
		return
	}
	if raw.RequestID == "" {
		return
	}

	// Extract tool name and input for logging
	var reqPayload struct {
		Subtype  string `json:"subtype"`
		ToolName string `json:"tool_name"`
		Input    any    `json:"input"`
	}
	_ = json.Unmarshal(raw.Request, &reqPayload)

	var inputMap map[string]any
	if reqPayload.Input != nil {
		if m, ok := reqPayload.Input.(map[string]any); ok {
			inputMap = m
		}
	}
	if inputMap == nil {
		inputMap = map[string]any{}
	}

	shortID := sess.sessionID[:8]
	log.Printf("[ClaudeCLI][%s] Auto-approving control_request: tool=%s subtype=%s id=%s",
		shortID, reqPayload.ToolName, reqPayload.Subtype, raw.RequestID)

	response := map[string]any{
		"type": "control_response",
		"response": map[string]any{
			"subtype":    "success",
			"request_id": raw.RequestID,
			"response": map[string]any{
				"behavior":     "allow",
				"updatedInput": inputMap,
			},
		},
	}
	data, err := json.Marshal(response)
	if err != nil {
		log.Printf("[ClaudeCLI][%s] Control response marshal error: %v", shortID, err)
		return
	}
	if _, err := io.WriteString(sess.stdin, string(data)+"\n"); err != nil {
		log.Printf("[ClaudeCLI][%s] Control response write error: %v", shortID, err)
	}
}

func (b *ClaudeCLIBackend) handleUserEvent(sess *claudeSession, rawLine string) {
	// Forward tool_result to bus for display purposes only.
	var raw struct {
		Message struct {
			Role    string `json:"role"`
			Content []struct {
				Type        string `json:"type"`
				ToolUseID   string `json:"tool_use_id"`
				Content     string `json:"content"`
				IsError     bool   `json:"is_error"`
			} `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal([]byte(rawLine), &raw); err != nil {
		return
	}

	// Forward to bus for display only — do NOT echo back to stdin
	// (claude already processed the tool result internally)
	for _, block := range raw.Message.Content {
		if block.Type == "tool_result" {
			b.sendToBus(protocol.NewEnvelope("", sessionTo(sess.sessionID), protocol.MsgEvent,
				&protocol.Payload{
					Content: []protocol.ContentBlock{
						{
							Type:    "tool_result",
							Content: block.Content,
							Status:  "done",
						},
					},
				}).WithSession(sess.sessionID))
		}
	}
}

func (b *ClaudeCLIBackend) HandlePermissionResponse(env *protocol.Envelope) {
	if env.Payload == nil {
		return
	}
	b.mu.Lock()
	sess, ok := b.sessions[env.SessionID]
	b.mu.Unlock()
	if !ok {
		return
	}
	requestID := env.Payload.ToolUseID
	if requestID == "" {
		return
	}
	approved := env.Payload.Approved

	sid := sess.sessionID
	if len(sid) > 8 {
		sid = sid[:8]
	}
	log.Printf("[ClaudeCLI][%s] Permission response: %s -> %v", sid, requestID, approved)
	if approved {
		log.Printf("[ClaudeCLI][%s] STDIN << control_response", sid)
		jsonMsg := fmt.Sprintf(`{"type":"control_response","request_id":%s,"response":{"approved":true}}`,
			jsonEscape(requestID))
		io.WriteString(sess.stdin, jsonMsg+"\n")
	} else {
		log.Printf("[ClaudeCLI][%s] Denied, closing session", sid)
		b.CloseSession(sess.sessionID)
	}
}

func (b *ClaudeCLIBackend) processMessage(sess *claudeSession, env *protocol.Envelope, text string) {
	sess.updateActivity()

	sid := sess.sessionID
	if len(sid) > 8 {
		sid = sid[:8]
	}
	log.Printf("[ClaudeCLI][%s] Sending: %s", sid, text[:min(len(text), 100)])

	// Send JSON formatted message
	jsonMsg := fmt.Sprintf(`{"type":"user","message":{"role":"user","content":%s}}`, jsonEscape(text))
	log.Printf("[ClaudeCLI][%s] STDIN << %s", sid, truncate(jsonMsg, 200))
	_, err := io.WriteString(sess.stdin, jsonMsg+"\n")
	if err != nil {
		log.Printf("[ClaudeCLI][%s] Write error: %v", sid, err)
		b.sendToBus(protocol.NewEnvelope("", sessionTo(sess.sessionID), protocol.MsgError,
			&protocol.Payload{Code: "STDIN_ERROR", Message: err.Error()},
		).WithSession(sess.sessionID))
	}
}

// jsonEscape produces a proper JSON string value from an arbitrary string.
func jsonEscape(s string) string {
	var buf strings.Builder
	buf.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			buf.WriteString(`\"`)
		case '\\':
			buf.WriteString(`\\`)
		case '\n':
			buf.WriteString(`\n`)
		case '\r':
			buf.WriteString(`\r`)
		case '\t':
			buf.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(&buf, `\u%04x`, r)
			} else {
				buf.WriteRune(r)
			}
		}
	}
	buf.WriteByte('"')
	return buf.String()
}

// SendToolResult sends a tool result back to the claude process for the given session.
func (b *ClaudeCLIBackend) SendToolResult(sessionID, toolUseID string, result interface{}) {
	b.mu.Lock()
	sess, exists := b.sessions[sessionID]
	b.mu.Unlock()
	if !exists || sess.isCompleted() {
		return
	}

	resultJSON, _ := json.Marshal(result)
	msg := fmt.Sprintf(`{"type":"tool_result","tool_use_id":"%s","content":%s}`, toolUseID, string(resultJSON))

	sess.mu.Lock()
	defer sess.mu.Unlock()
	if sess.stdin != nil {
		_, err := io.WriteString(sess.stdin, msg+"\n")
		if err != nil {
			log.Printf("[ClaudeCLI] Failed to send tool result to session %s: %v", sessionID[:8], err)
		} else {
			log.Printf("[ClaudeCLI] Tool result sent to session %s (tool_use_id=%s)", sessionID[:8], toolUseID)
		}
	}
}

// HasSession checks if a session exists and is still active (not completed).
func (b *ClaudeCLIBackend) HasSession(sessionID string) bool {
	b.mu.Lock()
	sess, exists := b.sessions[sessionID]
	b.mu.Unlock()
	return exists && !sess.isCompleted()
}

// InjectMessage sends a user message directly to an existing session's stdin.
func (b *ClaudeCLIBackend) InjectMessage(sessionID, text string) error {
	b.mu.Lock()
	sess, exists := b.sessions[sessionID]
	b.mu.Unlock()
	if !exists || sess.isCompleted() {
		return fmt.Errorf("session %s not active", sessionID[:min(8, len(sessionID))])
	}

	jsonMsg := fmt.Sprintf(`{"type":"user","message":{"role":"user","content":%s}}`, jsonEscape(text))
	sid := sessionID
	if len(sid) > 8 {
		sid = sid[:8]
	}
	sess.mu.Lock()
	defer sess.mu.Unlock()
	if sess.stdin == nil {
		return fmt.Errorf("session %s stdin not available", sid)
	}
	_, err := io.WriteString(sess.stdin, jsonMsg+"\n")
	if err != nil {
		return fmt.Errorf("session %s write error: %w", sid, err)
	}
	sess.updateActivity()
	log.Printf("[ClaudeCLI] Injected message to session %s", sid)
	return nil
}

// Evaluate starts a transient claude subprocess, sends a prompt, and returns the response.
// Used by the runtime to evaluate whether an @mention requires work or just a reply.
func (b *ClaudeCLIBackend) Evaluate(prompt string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	args := []string{
		"-p",
		"--output-format", "stream-json",
		"--input-format", "stream-json",
		"--verbose",
		"--permission-mode", "bypassPermissions",
		"--max-turns", "1",
	}
	cmd := exec.CommandContext(ctx, b.command, args...)
	cmd.Env = filterClaudeEnv(os.Environ())

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("stdout pipe: %w", err)
	}
	var stderrBuf strings.Builder
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("start: %w", err)
	}

	// Drain stderr in background
	go func() {
		bufio.NewScanner(stderr)
		sc := bufio.NewScanner(stderr)
		for sc.Scan() {
			stderrBuf.WriteString(sc.Text())
			stderrBuf.WriteByte('\n')
		}
	}()

	// Send the evaluation prompt
	msg := fmt.Sprintf(`{"type":"user","message":{"role":"user","content":%s}}`, jsonEscape(prompt))
	io.WriteString(stdin, msg+"\n")
	stdin.Close()

	// Read response — collect assistant text until result event
	var responseText strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var evt streamJSONEvent
		if err := json.Unmarshal([]byte(line), &evt); err != nil {
			continue
		}

		switch evt.Type {
		case "assistant":
			if evt.Message != nil {
				var msg assistantMessage
				if err := json.Unmarshal(*evt.Message, &msg); err != nil {
					continue
				}
				for _, block := range msg.Content {
					if block.Type == "text" {
						responseText.WriteString(block.Text)
					}
				}
			}
		case "result":
			// Clean up and return
			cmd.Process.Kill()
			cmd.Wait()
			return strings.TrimSpace(responseText.String()), nil
		}
	}

	// Process exited or scanner ended before result event
	cmd.Process.Kill()
	cmd.Wait()

	if err := scanner.Err(); err != nil {
		return strings.TrimSpace(responseText.String()), fmt.Errorf("scanner: %w", err)
	}

	result := strings.TrimSpace(responseText.String())
	if result == "" {
		errMsg := "no response from claude"
		if stderrStr := strings.TrimSpace(stderrBuf.String()); stderrStr != "" {
			const maxTail = 1024
			if len(stderrStr) > maxTail {
				stderrStr = stderrStr[len(stderrStr)-maxTail:]
			}
			errMsg = fmt.Sprintf("%s (stderr: %s)", errMsg, stderrStr)
		}
		return "", fmt.Errorf(errMsg)
	}
	return result, nil
}

// ---- plumbing ----

func (b *ClaudeCLIBackend) sendToBus(env *protocol.Envelope) {
	if b.sendFunc != nil {
		b.sendFunc(env)
	}
}

func (b *ClaudeCLIBackend) CloseSession(sessionID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	sess, ok := b.sessions[sessionID]
	if !ok {
		return
	}
	delete(b.sessions, sessionID)

	if sess.cancel != nil {
		sess.cancel()
	}
	sid := sessionID
	if len(sid) > 8 {
		sid = sid[:8]
	}
	log.Printf("[ClaudeCLI] Closed session %s", sid)
}

func (b *ClaudeCLIBackend) CleanIdleSessions() {
	b.mu.Lock()
	now := time.Now()
	var timedOut []*claudeSession
	for id, sess := range b.sessions {
		sess.mu.Lock()
		idle := now.Sub(sess.lastActivity)
		sess.mu.Unlock()

		if idle > b.timeout {
			sid := id
			if len(sid) > 8 {
				sid = sid[:8]
			}
			log.Printf("[ClaudeCLI] Idle timeout: session %s (idle %v)", sid, idle)
			if sess.cancel != nil {
				sess.cancel()
			}
			timedOut = append(timedOut, sess)
			delete(b.sessions, id)
		}
	}
	b.mu.Unlock()

	// Notify outside the lock to avoid deadlock
	for _, sess := range timedOut {
		if !sess.isCompleted() && b.onComplete != nil {
			b.onComplete(sess.sessionID, "", "timeout", true)
		}
	}
}

// Shutdown cancels all active sessions. Called during runtime graceful shutdown.
func (b *ClaudeCLIBackend) Shutdown() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for id, sess := range b.sessions {
		if sess.cancel != nil {
			sess.cancel()
		}
		delete(b.sessions, id)
	}
}

func (s *claudeSession) updateActivity() {
	s.mu.Lock()
	s.lastActivity = time.Now()
	s.mu.Unlock()
}

// getStr safely extracts a string from a map.
func getStr(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}

// coalesce returns the first non-empty string.
func coalesce(ss ...string) string {
	for _, s := range ss {
		if s != "" {
			return s
		}
	}
	return ""
}

// truncate shortens a string to n runes for logging.
func truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "..."
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// getMetaStr extracts a string from protocol metadata.
func getMetaStr(m map[string]any, key string) (string, bool) {
	if m == nil {
		return "", false
	}
	v, ok := m[key]
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

// escJSON escapes a string for safe inclusion in a JSON string value.
func escJSON(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r", `\r`)
	s = strings.ReplaceAll(s, "\t", `\t`)
	return s
}

// filterClaudeEnv removes internal Claude Code runtime markers from the
// environment so the child process does not mistake itself for a nested or
// resumed session, or inherit the parent's transport configuration.
// The public CLAUDE_CODE_* config namespace is preserved (users set those
// deliberately). Only undocumented per-process markers are stripped.
func filterClaudeEnv(base []string) []string {
	out := make([]string, 0, len(base))
	for _, entry := range base {
		key := entry
		if idx := strings.Index(entry, "="); idx >= 0 {
			key = entry[:idx]
		}
		switch key {
		case "CLAUDECODE", // "1" when running inside Claude Code
			"CLAUDE_CODE_ENTRYPOINT", // entrypoint marker (cli/sdk-cli/...)
			"CLAUDE_CODE_EXECPATH",   // path to the running CLI binary
			"CLAUDE_CODE_SESSION_ID", // per-session identifier
			"CLAUDE_CODE_SSE_PORT":   // IDE-extension transport port
			continue
		}
		if strings.HasPrefix(key, "CLAUDECODE_") {
			continue
		}
		out = append(out, entry)
	}
	return out
}
