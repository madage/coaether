package harness

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Tool names
const (
	ToolCreateSubTask  = "create_sub_task"
	ToolAssignTask     = "assign_task"
	ToolReviewTask     = "review_task"
	ToolAddComment     = "add_comment"
	ToolGetTaskDetail  = "get_task_detail"
	ToolListSubTasks   = "list_sub_tasks"
	ToolUpdateStatus              = "update_task_status"
	ToolProposeDecompositionPlan  = "propose_decomposition_plan"
)

// ToolDefinition defines a single tool's schema and metadata.
type ToolDefinition struct {
	Name             string          `json:"name"`
	Version          string          `json:"version"`
	Description      string          `json:"description"`
	Parameters       json.RawMessage `json:"parameters"`
	RequiredPerm     string          `json:"required_perm"`
	RequiredCap      string          `json:"required_capability"`
}

// AllTools returns the registered tool definitions.
func AllTools() map[string]ToolDefinition {
	return map[string]ToolDefinition{
		ToolProposeDecompositionPlan: {
			Name:        ToolProposeDecompositionPlan,
			Version:     "1.0",
			Description: "提出一个分解计划，将任务拆分为多个子任务供人工审核，审核通过后才创建实际子任务",
			Parameters:  proposeDecompositionPlanSchema,
			RequiredPerm: "task.write",
			RequiredCap:  ToolProposeDecompositionPlan,
		},
		ToolCreateSubTask: {
			Name:        ToolCreateSubTask,
			Version:     "1.0",
			Description: "在当前工作流下创建一个子任务，可设置依赖关系",
			Parameters:  createSubTaskSchema,
			RequiredPerm: "task.write",
			RequiredCap:  ToolCreateSubTask,
		},
		ToolAssignTask: {
			Name:        ToolAssignTask,
			Version:     "1.0",
			Description: "分配任务给用户或智能体",
			Parameters:  assignTaskSchema,
			RequiredPerm: "task.assign",
			RequiredCap:  ToolAssignTask,
		},
		ToolReviewTask: {
			Name:        ToolReviewTask,
			Version:     "1.0",
			Description: "审核一个已完成的任务，通过或打回",
			Parameters:  reviewTaskSchema,
			RequiredPerm: "task.review",
			RequiredCap:  ToolReviewTask,
		},
		ToolAddComment: {
			Name:        ToolAddComment,
			Version:     "1.0",
			Description: "在任务下添加评论",
			Parameters:  addCommentSchema,
			RequiredPerm: "comment.write",
			RequiredCap:  ToolAddComment,
		},
		ToolGetTaskDetail: {
			Name:        ToolGetTaskDetail,
			Version:     "1.0",
			Description: "查看任务详情",
			Parameters:  getTaskSchema,
			RequiredPerm: "task.read",
			RequiredCap:  ToolGetTaskDetail,
		},
		ToolListSubTasks: {
			Name:        ToolListSubTasks,
			Version:     "1.0",
			Description: "列出任务的子任务列表",
			Parameters:  listSubTasksSchema,
			RequiredPerm: "task.read",
			RequiredCap:  ToolListSubTasks,
		},
		ToolUpdateStatus: {
			Name:        ToolUpdateStatus,
			Version:     "1.0",
			Description: "更新任务状态（仅工作流内有效）",
			Parameters:  updateStatusSchema,
			RequiredPerm: "task.write",
			RequiredCap:  ToolUpdateStatus,
		},
	}
}

// ToolCall represents a parsed tool call from an agent.
type ToolCall struct {
	Type   string          `json:"type"`             // must be "tool_call"
	Tool   string          `json:"tool"`
	Params json.RawMessage `json:"params"`
	ID     string          `json:"id,omitempty"`
}

// ToolResult is the result of executing a tool call.
type ToolResult struct {
	Type   string      `json:"type"`
	Tool   string      `json:"tool"`
	ID     string      `json:"id,omitempty"`
	Status string      `json:"status"` // success | denied | error
	Result interface{} `json:"result,omitempty"`
	Error  *ToolError  `json:"error,omitempty"`
}

// ToolError describes a denied or failed tool call.
type ToolError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	Suggestion string `json:"suggestion,omitempty"`
}

// Error codes
const (
	ErrSchemaInvalid    = "schema_invalid"
	ErrToolNotFound     = "tool_not_found"
	ErrPermissionDenied = "permission_denied"
	ErrDepthExceeded    = "depth_exceeded"
	ErrLoopExceeded     = "loop_exceeded"
	ErrBudgetExceeded   = "budget_exceeded"
	ErrInternalError    = "internal_error"
)

// ToolCallRegex matches tool_call JSON blocks in LLM output.
var ToolCallRegex = regexp.MustCompile(`(?s)\{"type"\s*:\s*"tool_call".*?\}`)

// ParseToolCall attempts to parse a tool call from a JSON string.
func ParseToolCall(raw string) (*ToolCall, error) {
	var tc ToolCall
	if err := json.Unmarshal([]byte(raw), &tc); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	if tc.Type != "tool_call" {
		return nil, fmt.Errorf("type must be 'tool_call', got '%s'", tc.Type)
	}
	if tc.Tool == "" {
		return nil, fmt.Errorf("tool name is required")
	}
	if len(tc.Params) == 0 {
		return nil, fmt.Errorf("params is required")
	}
	return &tc, nil
}

// ExtractToolCalls extracts all tool_call JSON blocks from LLM output text.
func ExtractToolCalls(text string) []string {
	matches := ToolCallRegex.FindAllString(text, -1)
	return matches
}

// --- JSON Schemas (raw JSON for validation) ---

// Basic JSON Schema validators using simple field checks.

var createSubTaskSchema = json.RawMessage(`{
	"type": "object",
	"required": ["title"],
	"properties": {
		"title": {"type": "string", "maxLength": 200},
		"description": {"type": "string", "maxLength": 5000},
		"depends_on": {"type": "array", "items": {"type": "string"}},
		"parallel_group": {"type": "string"},
		"assignee_id": {"type": "string"},
		"assignee_type": {"type": "string", "enum": ["user", "agent_profile"]},
		"completion_behavior": {"type": "string", "enum": ["auto_done", "auto_review", "sample_review", "needs_review"]}
	}
}`)

var proposeDecompositionPlanSchema = json.RawMessage(`{
	"type": "object",
	"required": ["items"],
	"properties": {
		"items": {
			"type": "array",
			"minItems": 1,
			"items": {
				"type": "object",
				"required": ["title"],
				"properties": {
					"title": {"type": "string", "maxLength": 200},
					"description": {"type": "string", "maxLength": 5000},
					"assignee_id": {"type": "string"},
					"assignee_type": {"type": "string", "enum": ["user", "agent_profile"]},
					"depends_on": {"type": "array", "items": {"type": "string"}},
					"parallel_group": {"type": "string"},
					"completion_behavior": {"type": "string", "enum": ["auto_done", "auto_review", "sample_review", "needs_review"]}
				}
			}
		},
		"summary": {"type": "string", "maxLength": 2000}
	}
}`)

var assignTaskSchema = json.RawMessage(`{
	"type": "object",
	"required": ["task_id", "assignee_id", "assignee_type"],
	"properties": {
		"task_id": {"type": "string"},
		"assignee_id": {"type": "string"},
		"assignee_type": {"type": "string", "enum": ["user", "agent_profile"]}
	}
}`)

var reviewTaskSchema = json.RawMessage(`{
	"type": "object",
	"required": ["task_id", "action"],
	"properties": {
		"task_id": {"type": "string"},
		"action": {"type": "string", "enum": ["approved", "rejected"]},
		"comment": {"type": "string", "maxLength": 5000}
	}
}`)

var addCommentSchema = json.RawMessage(`{
	"type": "object",
	"required": ["task_id", "content"],
	"properties": {
		"task_id": {"type": "string"},
		"content": {"type": "string", "maxLength": 10000}
	}
}`)

var getTaskSchema = json.RawMessage(`{
	"type": "object",
	"required": ["task_id"],
	"properties": {
		"task_id": {"type": "string"}
	}
}`)

var listSubTasksSchema = json.RawMessage(`{
	"type": "object",
	"required": ["task_id"],
	"properties": {
		"task_id": {"type": "string"}
	}
}`)

var updateStatusSchema = json.RawMessage(`{
	"type": "object",
	"required": ["task_id", "status"],
	"properties": {
		"task_id": {"type": "string"},
		"status": {"type": "string", "enum": ["todo", "in_progress", "completed", "blocked"]}
	}
}`)

// ValidateParams checks that params contain at least the required fields.
// This is a simplified schema validation — returns nil if all required fields exist.
func ValidateParams(toolDef ToolDefinition, params json.RawMessage) error {
	var schema struct {
		Required   []string               `json:"required"`
		Properties map[string]interface{} `json:"properties"`
	}
	if err := json.Unmarshal(toolDef.Parameters, &schema); err != nil {
		return fmt.Errorf("invalid schema: %w", err)
	}

	var paramsMap map[string]interface{}
	if err := json.Unmarshal(params, &paramsMap); err != nil {
		return fmt.Errorf("params not valid JSON: %w", err)
	}

	for _, req := range schema.Required {
		if _, ok := paramsMap[strings.ReplaceAll(req, "_", "")]; !ok {
			// Also check with underscores
			if _, ok := paramsMap[req]; !ok {
				return fmt.Errorf("missing required parameter '%s'", req)
			}
		}
	}

	// Check parameter limits
	title, hasTitle := paramsMap["title"]
	if hasTitle {
		if s, ok := title.(string); ok && len(s) > 200 {
			return fmt.Errorf("title exceeds max length of 200")
		}
	}
	content, hasContent := paramsMap["content"]
	if hasContent {
		if s, ok := content.(string); ok && len(s) > 10000 {
			return fmt.Errorf("content exceeds max length of 10000")
		}
	}

	return nil
}
