package harness

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
)

// Harness is the security layer that intercepts and validates all agent Tool Calls.
// It embeds PolicyEngine, Auditor, and coordinates with DAGEngine.
type Harness struct {
	Policy  *PolicyEngine
	Auditor *Auditor
	DB      *sql.DB
}

// NewHarness creates a new Harness instance.
func NewHarness(db *sql.DB) *Harness {
	return &Harness{
		Policy:  NewPolicyEngine(db),
		Auditor: NewAuditor(db),
		DB:      db,
	}
}

// HandleToolCall is the single entry point for all agent tool calls.
// It runs validation through Policy -> Audit -> return result.
func (h *Harness) HandleToolCall(ctx *AgentContext, tc *ToolCall) *ToolResult {
	if h == nil {
		return errorResult(tc.Tool, tc.ID, ErrInternalError, "Harness not initialized")
	}

	// 1. Policy Check
	check := h.Policy.Check(ctx, tc)
	if !check.Allowed {
		h.Auditor.Log(ctx, tc, "denied", check.Message)
		log.Printf("[Harness] DENIED: agent=%s tool=%s reason=%s", ctx.AgentName, tc.Tool, check.Reason)
		return &ToolResult{
			Type:   "tool_result",
			Tool:   tc.Tool,
			ID:     tc.ID,
			Status: "denied",
			Error: &ToolError{
				Code:       check.ErrorCode,
				Message:    check.Message,
				Suggestion: check.Suggestion,
			},
		}
	}

	// 2. Execute (delegates to registered executors)
	result, err := h.execute(ctx, tc)
	if err != nil {
		h.Auditor.Log(ctx, tc, "error", err.Error())
		log.Printf("[Harness] ERROR: agent=%s tool=%s err=%v", ctx.AgentName, tc.Tool, err)
		return errorResult(tc.Tool, tc.ID, ErrInternalError, err.Error())
	}

	// 3. Audit success
	h.Auditor.Log(ctx, tc, "allowed", "")
	log.Printf("[Harness] ALLOWED: agent=%s tool=%s", ctx.AgentName, tc.Tool)

	return &ToolResult{
		Type:   "tool_result",
		Tool:   tc.Tool,
		ID:     tc.ID,
		Status: "success",
		Result: result,
	}
}

// ExecutorFunc is a function that executes a tool call.
type ExecutorFunc func(ctx *AgentContext, params json.RawMessage) (interface{}, error)

var executors map[string]ExecutorFunc

// RegisterExecutor registers a handler for a tool.
func RegisterExecutor(tool string, fn ExecutorFunc) {
	if executors == nil {
		executors = make(map[string]ExecutorFunc)
	}
	executors[tool] = fn
}

func (h *Harness) execute(ctx *AgentContext, tc *ToolCall) (interface{}, error) {
	if fn, ok := executors[tc.Tool]; ok {
		return fn(ctx, tc.Params)
	}
	// If no executor registered, the tool call is valid but requires external handling.
	// Return a placeholder indicating the tool call was accepted for processing.
	return map[string]interface{}{
		"status":  "accepted",
		"tool":    tc.Tool,
		"message": fmt.Sprintf("tool '%s' request received", tc.Tool),
	}, nil
}

func errorResult(tool, id, code, message string) *ToolResult {
	return &ToolResult{
		Type:   "tool_result",
		Tool:   tool,
		ID:     id,
		Status: "error",
		Error: &ToolError{
			Code:    code,
			Message: message,
		},
	}
}

// HandleToolCallJSON parses a JSON tool call string and runs it through the Harness.
func (h *Harness) HandleToolCallJSON(ctx *AgentContext, rawJSON string) *ToolResult {
	tc, err := ParseToolCall(rawJSON)
	if err != nil {
		return &ToolResult{
			Type:   "tool_result",
			Status: "denied",
			Error: &ToolError{
				Code:    ErrSchemaInvalid,
				Message: fmt.Sprintf("invalid tool call format: %v", err),
			},
		}
	}
	return h.HandleToolCall(ctx, tc)
}
