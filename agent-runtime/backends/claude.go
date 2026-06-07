package backends

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/coaether/server/protocol"
)

// ClaudeBackend uses the Anthropic Messages API to interact with Claude.
// Requires ANTHROPIC_API_KEY environment variable.
type ClaudeBackend struct {
	apiKey  string
	model   string
	client  *http.Client
}

// anthropicRequest maps to the Anthropic Messages API request body.
type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system,omitempty"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// anthropicResponse maps to the Anthropic Messages API response.
type anthropicResponse struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Role    string `json:"role"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Model   string `json:"model"`
	Usage   struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

// NewClaudeBackend creates a Claude API backend.
// If ANTHROPIC_API_KEY is not set, returns nil (disabled).
func NewClaudeBackend() *ClaudeBackend {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return nil
	}
	model := os.Getenv("CLAUDE_MODEL")
	if model == "" {
		model = "claude-opus-4-7"
	}
	return &ClaudeBackend{
		apiKey: apiKey,
		model:  model,
		client: &http.Client{Timeout: 120 * time.Second},
	}
}

func (b *ClaudeBackend) Name() string    { return "Claude" }
func (b *ClaudeBackend) Version() string { return fmt.Sprintf("API (%s)", b.model) }

func (b *ClaudeBackend) HandleMessage(env *protocol.Envelope) (*protocol.Envelope, error) {
	// Extract user text from content blocks
	userText := extractText(env.Payload.Content)
	if userText == "" {
		return nil, nil
	}

	// Build request
	reqBody := anthropicRequest{
		Model:     b.model,
		MaxTokens: 4096,
		Messages: []anthropicMessage{
			{Role: "user", Content: userText},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	// Send request
	req, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages",
		bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", b.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("API request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result anthropicResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	// Build response with content blocks
	blocks := []protocol.ContentBlock{
		protocol.StatusBlock("claude", "green"),
	}

	for _, c := range result.Content {
		if c.Type == "text" {
			blocks = append(blocks, protocol.MarkdownBlock(c.Text))
		}
	}

	if result.Usage.InputTokens > 0 || result.Usage.OutputTokens > 0 {
		blocks = append(blocks, protocol.SeparatorBlock(fmt.Sprintf("Tokens: %d in / %d out",
			result.Usage.InputTokens, result.Usage.OutputTokens)))
	}

	return protocol.NewEnvelope("", "", protocol.MsgMessage, &protocol.Payload{
		Content: blocks,
		Metadata: map[string]any{
			"model": result.Model,
		},
	}), nil
}

func extractText(blocks []protocol.ContentBlock) string {
	var parts []string
	for _, b := range blocks {
		if b.Content != "" {
			parts = append(parts, b.Content)
		}
	}
	return strings.Join(parts, "\n")
}
