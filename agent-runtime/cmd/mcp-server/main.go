package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
)

// ── JSON-RPC types ──

type jsonRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type jsonRPCResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Result  interface{} `json:"result,omitempty"`
	Error   *rpcError   `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// ── MCP types ──

type toolDef struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema inputSchema `json:"inputSchema"`
}

type inputSchema struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties"`
	Required   []string               `json:"required"`
}

type toolCallParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type toolCallResult struct {
	Content []contentItem `json:"content"`
}

type contentItem struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// ── Config ──

type config struct {
	serverURL string
	nodeID    string
	nodeSecret string
	taskID    string
	queueID   string
	profileID string
	callID    string
}

func loadConfig() config {
	return config{
		serverURL:  getEnv("COAETHER_SERVER_URL", "localhost:8088"),
		nodeID:     getEnv("COAETHER_NODE_ID", ""),
		nodeSecret: getEnv("COAETHER_NODE_SECRET", ""),
		taskID:     getEnv("COAETHER_TASK_ID", ""),
		queueID:    getEnv("COAETHER_QUEUE_ID", ""),
		profileID:  getEnv("COAETHER_PROFILE_ID", ""),
		callID:     getEnv("COAETHER_CALL_ID", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── Main ──

func main() {
	log.SetFlags(0)
	log.SetPrefix("[coaether-mcp] ")

	cfg := loadConfig()

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req jsonRPCRequest
		if err := json.Unmarshal(line, &req); err != nil {
			log.Printf("parse error: %v", err)
			continue
		}

		resp := handleRequest(&req, cfg)
		out, _ := json.Marshal(resp)
		fmt.Println(string(out))
	}

	if err := scanner.Err(); err != nil {
		log.Printf("stdin error: %v", err)
	}
}

func handleRequest(req *jsonRPCRequest, cfg config) *jsonRPCResponse {
	switch req.Method {
	case "initialize":
		return &jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]interface{}{
				"protocolVersion": "2024-11-05",
				"serverInfo": map[string]string{
					"name":    "coaether-harness",
					"version": "1.0.0",
				},
				"capabilities": map[string]interface{}{
					"tools": map[string]bool{},
				},
			},
		}

	case "notifications/initialized":
		return nil // no response for notifications

	case "tools/list":
		return &jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]interface{}{
				"tools": harnessToolDefs(),
			},
		}

	case "tools/call":
		var params toolCallParams
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return &jsonRPCResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &rpcError{Code: -32602, Message: "invalid params: " + err.Error()},
			}
		}
		result := callHarnessTool(cfg, params.Name, params.Arguments)
		return &jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  result,
		}

	default:
		return &jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &rpcError{Code: -32601, Message: "method not found: " + req.Method},
		}
	}
}

// ── Harness tool definitions in MCP format ──

func harnessToolDefs() []toolDef {
	return []toolDef{
		{
			Name:        "propose_decomposition_plan",
			Description: "Propose a decomposition plan with ALL sub-tasks at once. Submit your complete plan as an items array. The plan will be presented to the user for human review with per-task checkboxes. After human approval, real sub-tasks are created automatically. Use this INSTEAD of create_sub_task — you are a decomposition agent and ONLY have access to this tool for task creation.",
			InputSchema: inputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"summary": map[string]string{"type": "string", "description": "A summary explaining your decomposition strategy"},
					"items": map[string]interface{}{
						"type": "array",
						"description": "ALL sub-tasks as an array. Each item represents one sub-task to be created after approval.",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"title":              map[string]string{"type": "string", "description": "Sub-task title (max 200 chars)"},
								"description":         map[string]string{"type": "string", "description": "Detailed description of the sub-task"},
								"assignee_id":         map[string]string{"type": "string", "description": "Agent profile ID to assign (use exact UUID from the available agents list)"},
								"assignee_type":       map[string]interface{}{"type": "string", "enum": []string{"agent_profile"}, "description": "Must be 'agent_profile'"},
								"depends_on":          map[string]interface{}{"type": "array", "items": map[string]string{"type": "string"}, "description": "Titles of sub-tasks (in this plan) that this item depends on"},
								"parallel_group":       map[string]string{"type": "string", "description": "Group name for items that can run in parallel"},
								"completion_behavior":  map[string]interface{}{"type": "string", "enum": []string{"auto_done", "auto_review", "needs_review"}, "description": "What happens when this sub-task completes"},
							},
							"required": []string{"title", "description", "assignee_id", "assignee_type"},
						},
					},
				},
				Required: []string{"items"},
			},
		},
		{
			Name:        "create_sub_task",
			Description: "Create a sub-task under the current task. Use this to decompose a complex task into smaller, assignable sub-tasks. Each call creates ONE sub-task. Call multiple times for multiple sub-tasks.",
			InputSchema: inputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"title":              map[string]string{"type": "string", "description": "Sub-task title (max 200 chars)"},
					"description":         map[string]string{"type": "string", "description": "Detailed description of the sub-task"},
					"depends_on":         map[string]interface{}{"type": "array", "items": map[string]string{"type": "string"}, "description": "IDs of sub-tasks this depends on"},
					"parallel_group":      map[string]string{"type": "string", "description": "Group name for parallel execution"},
					"assignee_id":         map[string]string{"type": "string", "description": "Agent profile ID to assign"},
					"assignee_type":       map[string]interface{}{"type": "string", "enum": []string{"user", "agent_profile"}, "description": "Type of assignee"},
					"completion_behavior": map[string]interface{}{"type": "string", "enum": []string{"auto_done", "auto_review", "sample_review", "needs_review"}, "description": "What happens when sub-task is done"},
				},
				Required: []string{"title"},
			},
		},
		{
			Name:        "assign_task",
			Description: "Assign a task to a specific agent profile. Use after creating sub-tasks to delegate work.",
			InputSchema: inputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"task_id":       map[string]string{"type": "string", "description": "Task ID to assign"},
					"assignee_id":   map[string]string{"type": "string", "description": "Agent profile ID of assignee"},
					"assignee_type": map[string]interface{}{"type": "string", "enum": []string{"user", "agent_profile"}, "description": "Must be 'agent_profile' for agent assignment"},
				},
				Required: []string{"task_id", "assignee_id", "assignee_type"},
			},
		},
		{
			Name:        "review_task",
			Description: "Review a completed sub-task — approve it or reject it with feedback.",
			InputSchema: inputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"task_id": map[string]string{"type": "string", "description": "Task ID to review"},
					"action":  map[string]interface{}{"type": "string", "enum": []string{"approved", "rejected"}, "description": "Approve or reject the task"},
					"comment": map[string]string{"type": "string", "description": "Optional review comment or rejection reason"},
				},
				Required: []string{"task_id", "action"},
			},
		},
		{
			Name:        "add_comment",
			Description: "Post a SINGLE consolidated reply comment to a task. Put ALL your content (questions, summary, progress update) into ONE call. Do NOT call this tool more than once per round — multiple calls create duplicate comments that confuse the user.",
			InputSchema: inputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"task_id": map[string]string{"type": "string", "description": "Task ID to comment on"},
					"content": map[string]string{"type": "string", "description": "Comment text (max 10000 chars)"},
				},
				Required: []string{"task_id", "content"},
			},
		},
		{
			Name:        "get_task_detail",
			Description: "Get detailed information about a specific task.",
			InputSchema: inputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"task_id": map[string]string{"type": "string", "description": "Task ID to look up"},
				},
				Required: []string{"task_id"},
			},
		},
		{
			Name:        "list_sub_tasks",
			Description: "List all sub-tasks of a given task. Use to check what sub-tasks exist.",
			InputSchema: inputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"task_id": map[string]string{"type": "string", "description": "Parent task ID"},
				},
				Required: []string{"task_id"},
			},
		},
		{
			Name:        "update_task_status",
			Description: "Update the status of a task (todo, in_progress, done, review, blocked).",
			InputSchema: inputSchema{
				Type: "object",
				Properties: map[string]interface{}{
					"task_id": map[string]string{"type": "string", "description": "Task ID to update"},
					"status":  map[string]interface{}{"type": "string", "enum": []string{"todo", "in_progress", "done", "review", "blocked"}, "description": "New status"},
				},
				Required: []string{"task_id", "status"},
			},
		},
	}
}

// ── Call Harness API ──

func callHarnessTool(cfg config, toolName string, args json.RawMessage) *toolCallResult {
	body := map[string]interface{}{
		"task_id":          cfg.taskID,
		"queue_id":         cfg.queueID,
		"tool":             toolName,
		"params":           args,
		"agent_profile_id": cfg.profileID,
		"call_id":          cfg.callID,
	}

	bodyBytes, _ := json.Marshal(body)
	auth := fmt.Sprintf("node_id=%s&node_secret=%s", cfg.nodeID, cfg.nodeSecret)
	u := fmt.Sprintf("http://%s/api/node/tool-call?%s", cfg.serverURL, auth)

	resp, err := http.Post(u, "application/json", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return &toolCallResult{Content: []contentItem{{Type: "text", Text: fmt.Sprintf(`{"status":"error","error":{"message":"%s"}}`, err.Error())}}}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	// Parse server response and extract result
	var harnessResult map[string]interface{}
	if err := json.Unmarshal(respBody, &harnessResult); err != nil {
		return &toolCallResult{Content: []contentItem{{Type: "text", Text: string(respBody)}}}
	}

	resultJSON, _ := json.Marshal(harnessResult)
	return &toolCallResult{Content: []contentItem{{Type: "text", Text: string(resultJSON)}}}
}
