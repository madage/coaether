package protocol

import (
	"fmt"
	"math/rand"
	"time"
)

// Message type constants.
const (
	// System messages
	MsgHello = "hello"
	MsgBye   = "bye"
	MsgPing  = "ping"
	MsgPong  = "pong"
	MsgAck   = "ack"
	MsgError = "error"

	// Session lifecycle
	MsgSessionCreate  = "session.create"
	MsgSessionCreated = "session.created"
	MsgSessionJoin    = "session.join"
	MsgSessionJoined  = "session.joined"
	MsgSessionLeave   = "session.leave"
	MsgSessionEnd     = "session.end"

	// Application messages
	MsgMessage = "message"
	MsgCommand = "command"
	MsgEvent   = "event"
	MsgToolUse   = "tool.use"
	MsgToolResult = "tool.result"

	// Permission messages
	MsgPermissionRequest  = "permission.request"
	MsgPermissionResponse = "permission.response"
)

// Envelope is the universal message wrapper for all bus communication.
type Envelope struct {
	ID        string `json:"id"`
	From      string `json:"from"`
	To        string `json:"to"`
	Type      string `json:"type"`
	SessionID string `json:"session_id,omitempty"`

	Payload *Payload `json:"payload,omitempty"`

	Timestamp int64  `json:"timestamp"`
	ReplyTo   string `json:"reply_to,omitempty"`
	Priority  int    `json:"priority,omitempty"`
}

// NewEnvelope creates a new Envelope with a ULID-based ID and current timestamp.
func NewEnvelope(from, to, msgType string, payload *Payload) *Envelope {
	return &Envelope{
		ID:        newID(),
		From:      from,
		To:        to,
		Type:      msgType,
		Payload:   payload,
		Timestamp: time.Now().UnixMilli(),
	}
}

// WithSession sets the session ID on the envelope.
func (e *Envelope) WithSession(sessionID string) *Envelope {
	e.SessionID = sessionID
	return e
}

// WithReplyTo sets the reply target.
func (e *Envelope) WithReplyTo(replyTo string) *Envelope {
	e.ReplyTo = replyTo
	return e
}

// Payload is the body of a message.
type Payload struct {
	Content  []ContentBlock `json:"content,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`

	// Used by system/session messages
	Agents      []AgentSpec    `json:"agents,omitempty"`
	Members     []MemberSpec   `json:"members,omitempty"`
	Capabilities []Capability  `json:"capabilities,omitempty"`
	NodeInfo    map[string]string `json:"node_info,omitempty"`

	// Used by tool messages
	ToolUseID string `json:"tool_use_id,omitempty"`
	Tool      string `json:"tool,omitempty"`
	Input     any    `json:"input,omitempty"`
	Output    string `json:"output,omitempty"`
	ExitCode  int    `json:"exit_code,omitempty"`

	Approved bool `json:"approved,omitempty"`

	// Used by command messages
	Command   string `json:"command,omitempty"`
	Arguments any    `json:"arguments,omitempty"`

	// Used by error messages
	Code       string `json:"code,omitempty"`
	Message    string `json:"message,omitempty"`
	RetryAfter int    `json:"retry_after,omitempty"`

	// Used by hello
	EndpointType string `json:"endpoint_type,omitempty"`

	// Used by session.create
	Workspace string `json:"workspace,omitempty"`
	Context   any    `json:"context,omitempty"`
}

// AgentSpec describes an agent in session.create.
type AgentSpec struct {
	ID         string `json:"id"`
	Model      string `json:"model,omitempty"`
	InstanceID string `json:"instance_id,omitempty"`
	Backend    string `json:"backend,omitempty"` // "api" or "cli"
}

// MemberSpec describes a session member.
type MemberSpec struct {
	Endpoint string `json:"endpoint"`
	Role     string `json:"role"` // "owner", "member", "observer"
}

// Capability describes a capability advertised by an endpoint.
type Capability struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
	Backend string `json:"backend,omitempty"` // "api" or "cli"
}

// ContentType constants.
const (
	ContentText      = "text"
	ContentCode      = "code"
	ContentMarkdown  = "markdown"
	ContentTable     = "table"
	ContentCard      = "card"
	ContentImage     = "image"
	ContentFile      = "file"
	ContentProgress  = "progress"
	ContentToolUse   = "tool_use"
	ContentStatus    = "status"
	ContentSeparator = "separator"
)

// ContentBlock is a single piece of structured content.
type ContentBlock struct {
	Type string `json:"type"`

	// Text / Markdown
	Content string `json:"content,omitempty"`

	// Code
	Language string `json:"language,omitempty"`
	Filename string `json:"filename,omitempty"`

	// Table
	Headers []string   `json:"headers,omitempty"`
	Rows    [][]string `json:"rows,omitempty"`

	// Card
	Title       string       `json:"title,omitempty"`
	Description string       `json:"description,omitempty"`
	Actions     []CardAction `json:"actions,omitempty"`

	// Image / File
	MIME string `json:"mime,omitempty"`
	URL  string `json:"url,omitempty"`
	Alt  string `json:"alt,omitempty"`
	Name string `json:"name,omitempty"`
	Size int64  `json:"size,omitempty"`

	// Progress
	Status     string  `json:"status,omitempty"`  // "thinking", "running", "done", "error"
	Message    string  `json:"message,omitempty"`
	Progress   float64 `json:"progress,omitempty"` // 0.0 - 1.0

	// Tool use
	Tool     string `json:"tool,omitempty"`
	ToolInput any   `json:"tool_input,omitempty"`
	ToolOutput string `json:"tool_output,omitempty"`
	ExitCode  int    `json:"exit_code,omitempty"`
	Collapsed bool   `json:"collapsed,omitempty"`

	// Status
	Label string `json:"label,omitempty"`
	Color string `json:"color,omitempty"` // "green", "yellow", "red", "gray"

	// Separator
	SeparatorLabel string `json:"separator_label,omitempty"`
}

// CardAction is an action button in a card block.
type CardAction struct {
	Label   string `json:"label"`
	Type    string `json:"type"` // "download", "navigate", "clipboard", "command"
	URL     string `json:"url,omitempty"`
	Path    string `json:"path,omitempty"`
	Content string `json:"content,omitempty"`
	Command string `json:"command,omitempty"`
}

// Helper constructors for content blocks.

func TextBlock(content string) ContentBlock {
	return ContentBlock{Type: ContentText, Content: content}
}

func CodeBlock(language, content, filename string) ContentBlock {
	return ContentBlock{Type: ContentCode, Language: language, Content: content, Filename: filename}
}

func MarkdownBlock(content string) ContentBlock {
	return ContentBlock{Type: ContentMarkdown, Content: content}
}

func TableBlock(headers []string, rows [][]string) ContentBlock {
	return ContentBlock{Type: ContentTable, Headers: headers, Rows: rows}
}

func StatusBlock(label, color string) ContentBlock {
	return ContentBlock{Type: ContentStatus, Label: label, Color: color}
}

func ProgressBlock(status, message string) ContentBlock {
	return ContentBlock{Type: ContentProgress, Status: status, Message: message}
}

func SeparatorBlock(label string) ContentBlock {
	return ContentBlock{Type: ContentSeparator, SeparatorLabel: label}
}

// newID generates a message ID with format "msg_" + timestamp + random.
func newID() string {
	return fmt.Sprintf("msg_%x_%x", time.Now().UnixMilli(), rand.Int63())
}
