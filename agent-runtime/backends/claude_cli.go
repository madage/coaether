package backends

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/superco/server/protocol"
)

var ansiRegexp = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(\x07|\x1b\\)`)

// ClaudeCLIBackend launches "claude --print" for each message.
// This works with any provider (DeepSeek, etc.) configured for the claude CLI.
type ClaudeCLIBackend struct {
	command  string
	mu       sync.Mutex
	sessions map[string]*cliSession
}

type cliSession struct {
	history []string // message history (for future use)
}

// NewClaudeCLIBackend creates a CLI backend using the given command path.
func NewClaudeCLIBackend(cmdPath string) *ClaudeCLIBackend {
	if cmdPath == "" {
		cmdPath = "claude"
	}
	if _, err := exec.LookPath(cmdPath); err != nil {
		log.Printf("[ClaudeCLI] Command not found: %s", cmdPath)
		return nil
	}
	return &ClaudeCLIBackend{
		command:  cmdPath,
		sessions: make(map[string]*cliSession),
	}
}

func (b *ClaudeCLIBackend) Name() string    { return "Claude Code" }
func (b *ClaudeCLIBackend) Version() string { return "CLI" }

func (b *ClaudeCLIBackend) HandleMessage(env *protocol.Envelope) (*protocol.Envelope, error) {
	if env.Payload == nil {
		return nil, nil
	}
	sessionID := env.SessionID
	if sessionID == "" {
		return nil, nil
	}

	// Extract user text
	userText := extractText(env.Payload.Content)
	if userText == "" {
		return nil, nil
	}

	// Track session for potential future use
	b.mu.Lock()
	if _, ok := b.sessions[sessionID]; !ok {
		b.sessions[sessionID] = &cliSession{}
	}
	b.mu.Unlock()

	// Run claude --print
	log.Printf("[ClaudeCLI] Running: %s --print %q", b.command, userText)
	output, err := b.runClaude(userText)
	if err != nil {
		log.Printf("[ClaudeCLI] Error: %v", err)
		return protocol.NewEnvelope("", "", protocol.MsgError,
			&protocol.Payload{Code: "CLI_ERROR", Message: err.Error()},
		), nil
	}

	if output == "" {
		return nil, nil
	}

	// Clean up output
	cleanOutput := stripANSI(output)
	if cleanOutput == "" {
		return nil, nil
	}

	blocks := []protocol.ContentBlock{
		protocol.StatusBlock("claude", "green"),
		protocol.MarkdownBlock(cleanOutput),
	}

	return protocol.NewEnvelope("", "", protocol.MsgMessage, &protocol.Payload{
		Content: blocks,
	}), nil
}

func (b *ClaudeCLIBackend) runClaude(prompt string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, b.command, "--print", prompt)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("claude timed out (120s)")
		}
		if stderr.Len() > 0 {
			return "", fmt.Errorf("claude error: %s", strings.TrimSpace(stderr.String()))
		}
		return "", fmt.Errorf("claude: %w", err)
	}

	return stdout.String(), nil
}

// stripANSI removes ANSI escape sequences and terminal control characters.
func stripANSI(s string) string {
	s = ansiRegexp.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\r", "")
	return s
}

func (b *ClaudeCLIBackend) CloseSession(sessionID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.sessions, sessionID)
	log.Printf("[ClaudeCLI] Closed session %s", sessionID)
}
