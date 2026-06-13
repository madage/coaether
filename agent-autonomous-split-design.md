# 模糊任务自主拆解与分发 — 实现方案

> 目标：用户提出一个模糊任务，系统自动评估、拆解为多个子任务、分配给不同智能体、按 DAG 依赖关系推进执行。

---

## 目录

1. [现状评估](#1-现状评估)
2. [全流程概览](#2-全流程概览)
3. [新增组件 1：Harness HTTP API 端点](#3-新增组件-1harness-http-api-端点)
4. [新增组件 2：Runtime tool_call 拦截与执行](#4-新增组件-2runtime-tool_call-拦截与执行)
5. [新增组件 3：补全缺失的 Executor](#5-新增组件-3补全缺失的-executor)
6. [新增组件 4：问题拆分专家 Agent Prompt](#6-新增组件-4问题拆分专家-agent-prompt)
7. [新增组件 5：一键模糊任务入口 API](#7-新增组件-5一键模糊任务入口-api)
8. [新增组件 6：任务快递员 Agent](#8-新增组件-6任务快递员-agent)
9. [数据流完整跟踪](#9-数据流完整跟踪)
10. [涉及文件汇总](#10-涉及文件汇总)
11. [实施步骤](#11-实施步骤)

---

## 1. 现状评估

### 1.1 已就绪

| 组件 | 文件 | 状态 |
|------|------|------|
| Harness 7 工具定义 | `server/harness/tools.go` | ✅ 完整 |
| tool_call JSON 解析 | `server/harness/tools.go` (`ParseToolCall`, `ExtractToolCalls`, `ToolCallRegex`) | ✅ |
| PolicyEngine 权限检查 | `server/harness/policy.go` | ✅ |
| Auditor 审计日志 | `server/harness/auditor.go` | ✅ |
| HandleToolCall 入口 | `server/harness/harness.go` | ✅ |
| DAG 依赖引擎 | `server/handlers/dag.go` / `workflow.go` | ✅ |
| create_sub_task Executor | `server/handlers/workflow.go:319` | ✅ |
| add_comment Executor | `server/handlers/workflow.go:385` | ✅ |
| get_task_detail Executor | `server/handlers/workflow.go:416` | ✅ |
| list_sub_tasks Executor | `server/handlers/workflow.go:446` | ✅ |
| @mention 评估→决策 | `agent-runtime/runtime.go:661` (`handleAgentMention`) | ✅ |
| handleSessionComplete | `agent-runtime/runtime.go:613` | ✅ |
| Claude CLI Backend | `agent-runtime/backends/claude_cli.go` | ✅ |
| 工作流 CRUD API | `server/handlers/workflow.go` | ✅ |
| 节点 Agent API | `server/handlers/node_agent_handler.go` | ✅ |

### 1.2 缺失环节

| 缺口 | 影响 | 严重性 |
|------|------|--------|
| Runtime 无 tool_call 拦截执行 | Claude 输出了 tool_call 但无人执行 | 🔴 致命 |
| 缺少 assign_task Executor | 智能体无法分配任务给其他人 | 🟡 严重 |
| 缺少 review_task Executor | 智能体无法审核任务 | 🟡 严重 |
| 缺少 update_task_status Executor | 智能体无法改状态 | 🟡 严重 |
| 无 Harness HTTP API | Runtime 无法远程调用 Harness | 🔴 致命 |
| 无问题拆分 Agent Prompt | 智能体不知道如何拆任务 | 🟡 严重 |
| 无一键入口 API | 用户需要手动多步操作 | 🟢 一般 |
| 无任务完成→自动推进逻辑 | 父任务不会自动关闭 | 🟡 严重 |

---

## 2. 全流程概览

```
用户提交模糊需求
       │
       ▼
┌─────────────────────────────┐
│  POST /api/tasks/fuzzy-split │  ← 新增一键入口
│  1. 创建工作流 (workflow)    │
│  2. 创建主任务               │
│  3. 分配"问题拆分专家"智能体 │
│  4. 触发 in_progress         │
└──────────┬──────────────────┘
           │
           ▼
  问题拆分专家收到任务
  (MsgAgentTaskTrigger)
           │
           ▼
  Claude CLI 加载 Harness 工具描述
  分析需求 → 决定拆法
           │
           ├──────────────────────────────────────────────┐
           │ 调用 create_sub_task (多次)                   │
           │  子任务 A: "编写用户认证模块"                 │
           │    assignee: agent_a, depends_on: []         │
           │  子任务 B: "编写数据库模型"                   │
           │    assignee: agent_b, depends_on: [A]        │
           │  子任务 C: "编写前端页面"                     │
           │    assignee: agent_c, depends_on: [B]        │
           │    parallel_group: "frontend"                 │
           │  子任务 D: "编写 API 路由"                    │
           │    assignee: agent_d, depends_on: [B]         │
           │    parallel_group: "frontend"                 │
           └──────────────┬───────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────┐
  │  DAG 引擎自动管理执行顺序                          │
  │                                                   │
  │  A(todo) → 条件满足 → in_progress → Agent A 执行  │
  │              → A done                             │
  │              → B/C/D 依赖解除 → 各自 in_progress   │
  │              → Agent B, C, D 并行执行              │
  │              → 全部 done → 主任务自动 done/review   │
  └──────────────────────────────────────────────────┘
```

### 2.1 关键设计决策

**Runtime 如何执行 tool_call？**

两种方案对比：

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A: HTTP API 调用** | Runtime 收到 Claude tool_use → POST 到服务端 Harness HTTP API → 执行 → 返回结果 | 松耦合，Runtime 不需要导入 harness 包 | 多一次 HTTP 开销 |
| **B: 内嵌 harness 包** | Runtime 直接导入 `server/harness`，Go 函数调用 | 零网络开销 | Runtime 需要访问 DB，耦合加重 |

**选择方案 A (HTTP API)**，因为：
- Runtime 与 Server 本来就通过 HTTP/WS 通信
- Harness 执行需要 DB 访问（创建任务、审计日志），Runtime 不应持有 DB 连接
- 方案 A 保持 Runtime 轻量

---

## 3. 新增组件 1：Harness HTTP API 端点

**文件:** `server/handlers/node_agent_handler.go`

新增端点供 Runtime 调用以执行工具。

### 3.1 端点定义

```go
// HandleToolCall accepts a tool call from the runtime, executes it via Harness, and returns the result.
func (h *NodeAgentHandler) HandleToolCall(c *gin.Context) {
    auth, ok := h.authenticate(c)
    if !ok {
        return
    }

    var req struct {
        TaskID    string          `json:"task_id"`
        QueueID   string          `json:"queue_id"`
        Tool      string          `json:"tool"`
        Params    json.RawMessage `json:"params"`
        CallID    string          `json:"call_id,omitempty"`
        ProfileID string          `json:"agent_profile_id"`
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Resolve agent context (profile, permissions, capabilities)
    ctx := h.resolveAgentContext(auth.NodeID, req.ProfileID, req.TaskID)

    // Build ToolCall
    tc := &harness.ToolCall{
        Type:   "tool_call",
        Tool:   req.Tool,
        Params: req.Params,
        ID:     req.CallID,
    }

    // Execute via Harness
    result := h.Harness.HandleToolCall(ctx, tc)
    c.JSON(http.StatusOK, result)
}
```

### 3.2 路由注册

**文件:** `server/main.go`

```go
r.POST("/api/node/tool-call", nodeAgentH.HandleToolCall)
```

### 3.3 NodeAgentHandler 新增字段

```go
type NodeAgentHandler struct {
    DB       *sql.DB
    Hub      *DashboardHub
    Bus      *protocol.MessageBus
    Harness  *harness.Harness       // ← 新增
}
```

### 3.4 resolveAgentContext 方法

从 DB 查询 agent_profile 的权限、能力、当前工作流等信息，构建 `harness.AgentContext`。

---

## 4. 新增组件 2：Runtime tool_call 拦截与执行

### 4.1 消息类型

**文件:** `server/protocol/message.go`

新增消息类型（已存在，确认）：

```go
MsgToolUse    = "tool.use"     // 已定义
MsgToolResult = "tool.result"  // 已定义
```

### 4.2 Runtime 处理 tool_use

**文件:** `agent-runtime/runtime.go`

在 `handleMessage` 的 switch 中新增 case：

```go
case protocol.MsgToolUse:
    // Only intercept tool calls from auto-task sessions
    if env.Payload != nil && r.isAutoTaskSession(env.SessionID) {
        r.handleAutoTaskToolCall(env)
    }
    // Non-auto-task sessions: tool_use is already forwarded to UI by backend
```

### 4.3 handleAutoTaskToolCall 方法

```go
func (r *Runtime) handleAutoTaskToolCall(env *protocol.Envelope) {
    // 1. Extract tool info from payload
    toolName := env.Payload.Tool
    toolInput := env.Payload.Input

    // 2. Get session context (task_id, queue_id, agent_profile_id)
    meta := r.sessionMeta[env.SessionID]

    // 3. POST to server Harness API
    body := map[string]interface{}{
        "task_id":          meta["task_id"],
        "queue_id":         meta["queue_id"],
        "tool":             toolName,
        "params":           json.RawMessage(toolInput),
        "agent_profile_id": meta["agent_profile_id"],
    }

    result := r.callHarnessAPI(body)

    // 4. Send tool result back to Claude CLI
    r.sendToolResultToClaude(env.SessionID, result)
}
```

### 4.4 callHarnessAPI

```go
func (r *Runtime) callHarnessAPI(body map[string]interface{}) *harness.ToolResult {
    baseURL := "http://" + r.ServerURL
    auth := fmt.Sprintf("node_id=%s&node_secret=%s", r.NodeID, r.Secret)

    bodyBytes, _ := json.Marshal(body)
    u := fmt.Sprintf("%s/api/node/tool-call?%s", baseURL, auth)

    resp, err := http.Post(u, "application/json", bytes.NewBuffer(bodyBytes))
    if err != nil {
        return &harness.ToolResult{Status: "error", Error: &harness.ToolError{Message: err.Error()}}
    }
    defer resp.Body.Close()

    var result harness.ToolResult
    json.NewDecoder(resp.Body).Decode(&result)
    return &result
}
```

### 4.5 sendToolResultToClaude

将 Harness 的执行结果以 tool_result 格式写回 Claude CLI 的 stdin。

**文件:** `agent-runtime/backends/claude_cli.go`

```go
func (b *ClaudeCLIBackend) SendToolResult(sessionID, toolUseID string, result interface{}) {
    // Write tool_result JSON to claude's stdin
    // Claude expects: {"type":"tool_result","tool_use_id":"...","content":"..."}
}
```

这需要 ClaudeCLIBackend 暴露写入 stdin 的方法，或者通过 session 引用写入。

### 4.6 isAutoTaskSession

```go
func (r *Runtime) isAutoTaskSession(sessionID string) bool {
    r.connMu.Lock()
    defer r.connMu.Unlock()
    meta, ok := r.sessionMeta[sessionID]
    return ok && meta["is_auto_task"] == "true"
}
```

### 4.7 自动任务 Session 的创建携带 profile_id

**文件:** `server/handlers/node_agent_handler.go` — `CreateSession`

当前创建 session 时，context 中已有 `task_id`、`queue_id`、`is_auto_task`。需要额外携带 `agent_profile_id`：

```go
createEnv.Payload.Context = map[string]interface{}{
    "task_id":           req.TaskID,
    "queue_id":          req.QueueID,
    "agent_profile_id":  agentProfileID,  // ← 从 agent_profile 查询
    "is_auto_task":      true,
}
```

---

## 5. 新增组件 3：补全缺失的 Executor

**文件:** `server/handlers/workflow.go` — `RegisterToolExecutors()`

### 5.1 assign_task Executor

```go
harness.RegisterExecutor(harness.ToolAssignTask, func(ctx *harness.AgentContext, params json.RawMessage) (interface{}, error) {
    var p struct {
        TaskID       string `json:"task_id"`
        AssigneeID   string `json:"assignee_id"`
        AssigneeType string `json:"assignee_type"`
    }
    if err := json.Unmarshal(params, &p); err != nil {
        return nil, fmt.Errorf("invalid params: %w", err)
    }
    if p.TaskID == "" || p.AssigneeID == "" || p.AssigneeType == "" {
        return nil, fmt.Errorf("task_id, assignee_id, assignee_type are required")
    }

    _, err := h.DB.Exec(
        `UPDATE tasks SET assignee_id = $1, assignee_type = $2 WHERE id = $3 AND deleted_at IS NULL`,
        p.AssigneeID, p.AssigneeType, p.TaskID,
    )
    if err != nil {
        return nil, fmt.Errorf("failed to assign task: %w", err)
    }

    log.Printf("[Harness] Agent %s assigned task %s to %s (%s)", ctx.AgentName[:8], p.TaskID[:8], p.AssigneeID[:8], p.AssigneeType)
    return map[string]string{"status": "assigned", "task_id": p.TaskID}, nil
})
```

### 5.2 review_task Executor

```go
harness.RegisterExecutor(harness.ToolReviewTask, func(ctx *harness.AgentContext, params json.RawMessage) (interface{}, error) {
    var p struct {
        TaskID  string `json:"task_id"`
        Action  string `json:"action"`  // "approved" | "rejected"
        Comment string `json:"comment"`
    }
    if err := json.Unmarshal(params, &p); err != nil {
        return nil, fmt.Errorf("invalid params: %w", err)
    }
    if p.TaskID == "" || p.Action == "" {
        return nil, fmt.Errorf("task_id and action are required")
    }

    newStatus := "review"
    if p.Action == "approved" {
        newStatus = "done"
    } else if p.Action == "rejected" {
        newStatus = "in_progress"
    }

    _, err := h.DB.Exec(
        `UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        newStatus, time.Now(), p.TaskID,
    )
    if err != nil {
        return nil, fmt.Errorf("failed to review task: %w", err)
    }

    return map[string]string{"status": newStatus, "task_id": p.TaskID}, nil
})
```

### 5.3 update_task_status Executor

```go
harness.RegisterExecutor(harness.ToolUpdateStatus, func(ctx *harness.AgentContext, params json.RawMessage) (interface{}, error) {
    var p struct {
        TaskID string `json:"task_id"`
        Status string `json:"status"` // todo | in_progress | completed | blocked
    }
    if err := json.Unmarshal(params, &p); err != nil {
        return nil, fmt.Errorf("invalid params: %w", err)
    }
    if p.TaskID == "" || p.Status == "" {
        return nil, fmt.Errorf("task_id and status are required")
    }

    validStatuses := map[string]bool{"todo": true, "in_progress": true, "completed": true, "blocked": true}
    if !validStatuses[p.Status] {
        return nil, fmt.Errorf("invalid status: %s", p.Status)
    }

    _, err := h.DB.Exec(
        `UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        p.Status, time.Now(), p.TaskID,
    )
    if err != nil {
        return nil, fmt.Errorf("failed to update status: %w", err)
    }

    return map[string]string{"status": p.Status, "task_id": p.TaskID}, nil
})
```

---

## 6. 新增组件 4：问题拆分专家 Agent Prompt

### 6.1 System Prompt

当创建"问题拆分专家"智能体 Profile 时，使用以下 System Prompt：

```
你是一名资深项目架构师，擅长将模糊需求拆解为可执行的子任务。

## 你的核心职责

收到一个模糊的任务后，你的工作流程是：

1. **分析需求** — 理解任务的核心目标和技术领域
2. **规划任务拆解** — 将大任务拆分为多个独立可执行的子任务
3. **调用工具创建子任务** — 使用 create_sub_task 工具逐一创建

## 子任务设计原则

- **粒度适中**：每个子任务应在 30-60 分钟内完成
- **明确负责人**：为每个子任务指定 assignee_id 和 assignee_type
- **依赖关系**：用 depends_on 标注前置任务
- **并行执行**：无依赖的子任务使用 parallel_group 实现并行
- **审核策略**：关键路径任务设为 auto_review，常规任务设为 auto_done

## 可用工具

### create_sub_task
在当前工作流下创建一个子任务。

参数：
- title (必填): 子任务标题，最长 200 字符
- description: 任务描述，详细说明需要做什么
- depends_on: 前置任务 ID 列表，这些任务完成后才能开始本任务
- parallel_group: 并行分组名称，同组任务无依赖时可并行
- assignee_id: 负责人 ID（智能体 profile ID）
- assignee_type: "user" 或 "agent_profile"
- completion_behavior: "auto_done" | "auto_review" | "sample_review" | "needs_review"

### assign_task
分配任务给特定负责人。

参数：
- task_id (必填): 任务 ID
- assignee_id (必填): 负责人 ID
- assignee_type (必填): "user" 或 "agent_profile"

### add_comment
在任务下添加评论。

参数：
- task_id (必填): 任务 ID
- content (必填): 评论内容

## 输出格式

当你需要拆解任务时，使用 tool_call JSON 块：

{"type":"tool_call","tool":"create_sub_task","params":{"title":"...","description":"...","assignee_id":"...","assignee_type":"agent_profile","depends_on":[],"completion_behavior":"auto_done"}}

创建所有子任务后，总结你的拆分方案。
```

### 6.2 Behavior Instructions

```
以专业项目经理的语气沟通。拆解任务时要解释你的拆分逻辑，让团队成员理解为什么这样划分。保持清晰、结构化、有逻辑。
```

### 6.3 能力标签

```
project-architect, task-splitting, workflow-design, dag-orchestration
```

---

## 7. 新增组件 5：一键模糊任务入口 API

**文件:** `server/handlers/workflow.go`

### 7.1 端点

```
POST /api/tasks/fuzzy-split
```

### 7.2 请求/响应

```json
// Request
{
  "title": "开发一个用户登录系统",
  "description": "需要完整的注册、登录、找回密码功能",
  "workspace_id": "uuid"
}

// Response
{
  "workflow_id": "uuid",
  "task_id": "uuid",
  "splitter_profile_id": "uuid",
  "status": "created"
}
```

### 7.3 实现逻辑

```go
func (h *WorkflowHandler) FuzzySplit(c *gin.Context) {
    var req struct {
        Title       string `json:"title"`
        Description string `json:"description"`
        WorkspaceID string `json:"workspace_id"`
    }
    if err := c.ShouldBindJSON(&req); err != nil { ... }

    userID := c.GetString("user_id")

    // 1. 创建工作流
    workflowID := uuid.New().String()
    h.DB.Exec(`INSERT INTO workflows (...) VALUES (...)`)

    // 2. 查找或创建"问题拆分专家"agent profile
    splitterProfile := h.findOrCreateSplitterProfile(req.WorkspaceID)

    // 3. 创建主任务（关联工作流 + 分配拆分专家）
    taskID := uuid.New().String()
    h.DB.Exec(
        `INSERT INTO tasks (id, title, description, status, workflow_id, assignee_id, assignee_type, ...)
         VALUES ($1, $2, $3, 'todo', $4, $5, 'agent_profile', ...)`,
        taskID, req.Title, req.Description, workflowID, splitterProfile.ID,
    )

    // 4. 创建队列条目 + 自动触发拆分专家
    h.triggerAgentTask(taskID, splitterProfile, "todo")

    c.JSON(http.StatusOK, gin.H{
        "workflow_id":        workflowID,
        "task_id":            taskID,
        "splitter_profile_id": splitterProfile.ID,
        "status":             "created",
    })
}
```

---

## 8. 新增组件 6：任务快递员 Agent

问题拆分专家创建的每个子任务需要分配给具体的执行智能体。这些智能体需要意识到自己在工作流中。

### 8.1 通用执行 Agent System Prompt 模板

```go
你是一名执行工程师，正在处理工作流中的子任务。

## 当前任务
{task_title}

## 任务描述
{task_description}

## 工作流上下文
- 这是工作流「{workflow_title}」中的一个子任务
- 你的完成会影响下游依赖任务
- 完成后系统会自动推进依赖链

## 可用工具
- add_comment: 在任务下添加评论，汇报进度和结果
- get_task_detail: 查看当前或其他任务详情
- list_sub_tasks: 列出当前任务的所有子任务
- update_task_status: 更新当前任务状态（in_progress → completed）

## 行为规范
1. 执行任务时先更新状态为 in_progress
2. 完成后更新状态为 completed
3. 在评论中总结完成内容
4. 如果遇到阻塞，更新状态为 blocked 并说明原因
```

### 8.2 System Prompt 注入时机

在 Runtime 的 `handleAgentMention` 或 `handleSessionComplete` 中，当创建 session 时，如果任务是工作流的一部分，将工作流上下文注入 System Prompt。

**文件:** `server/handlers/node_agent_handler.go` — `CreateSession`

当前 prompt 构建：
```go
prompt := fmt.Sprintf("Task: %s\n\nDescription: %s\n\nPlease work on this task.", title, description)
```

需要扩展为：
```go
prompt := buildAgentPrompt(title, description, workflowID, taskID)
```

---

## 9. 数据流完整跟踪

### Flow A: 用户提交模糊任务

```
用户 → POST /api/tasks/fuzzy-split
  → 创建工作流 (workflow_id)
  → 创建主任务 (task_id, workflow_id, assignee="问题拆分专家")
  → 创建 task_agent_queue (status=queued)
  → MessageBus 发送 MsgAgentTaskTrigger → runtime://<splitter_node>
  → 运行时收到：
      → 创建 session (带 is_auto_task=true, agent_profile_id=splitter)
      → Claude CLI 启动 + 加载 Harness 工具描述
      → 智能体分析需求
      → 输出 tool_call: create_sub_task × N 次
      → Runtime 拦截 tool_use:
          → POST /api/node/tool-call (Harness API)
          → Harness.Execute → create_sub_task Executor
          → 子任务写入 DB + DAG 依赖
          → 返回结果给 Runtime
      → Runtime 将结果送回 Claude CLI (tool_result)
      → Claude CLI 继续输出 → 最终完成
      → handleSessionComplete 更新队列状态
      → 子任务等待执行...
```

### Flow B: 子任务自动分发执行

```
DAG 引擎检测到子任务 A 依赖已满足
  → 子任务 A 状态从 blocked → todo
  → 如果有 assignee, 触发 dispatcher:

  dispatcher 逻辑:
      → 检查子任务 A 是否有 assignee (agent_profile)
      → 创建 task_agent_queue (status=queued)
      → 检查该 agent 是否在线
          → 在线: MsgAgentTaskTrigger → runtime
          → 离线: 等待轮询

  Runtime 收到 MsgAgentTaskTrigger:
      → 创建 session
      → Claude CLI 启动 (带工作流上下文 prompt)
      → 执行任务 (可能调用更多工具)
      → 完成后 update_task_status → completed
      → handleSessionComplete 更新队列

  DAG 引擎检测到子任务 A 完成:
      → 解除 B, C, D 的依赖
      → B, C, D 状态 → todo → 重复上面的派发流程
```

### Flow C: DAG 自动推进（已有逻辑）

```
子任务完成时 UpdateQueueStatus(status=completed)
  → server/handlers/node_agent_handler.go 中
  → 自动更新任务状态为 done
  → (新增) 调用 DAGEngine.OnTaskCompleted(taskID)
      → 查询下游依赖
      → 检查每个下游的所有前置是否已完成
      → 全部完成 → 设该下游为 todo
      → 设下游为 todo 后 → 如果有 assignee 智能体 → 自动触发
```

### Flow D: 主任务自动关闭

```
所有子任务完成时:
  → DAG 引擎检测到主任务下无进行中的子任务
  → 更新主任务状态为 done 或 review (取决于 completion_behavior)
  → WebSocket 推送给 UI
```

---

## 10. 涉及文件汇总

| 文件 | 改动 | 优先级 |
|------|------|--------|
| `server/handlers/workflow.go` | 补全 3 个 Executor；新增 FuzzySplit 入口 | P0 |
| `server/handlers/node_agent_handler.go` | 新增 Harness 字段、HandleToolCall 端点、resolveAgentContext；修改 CreateSession 携带 agent_profile_id | P0 |
| `server/main.go` | 注册 Harness HTTP API 路由；注入 Harness 到 NodeAgentHandler | P0 |
| `agent-runtime/runtime.go` | 新增 tool_call 拦截 case、handleAutoTaskToolCall、callHarnessAPI、isAutoTaskSession | P0 |
| `agent-runtime/backends/claude_cli.go` | 新增 SendToolResult 方法；暴露 stdin 写入能力 | P0 |
| `server/handlers/dag.go` | 新增 OnTaskCompleted 方法（自动推进下游） | P1 |
| `server/protocol/message.go` | 可能新增 dispatcher 相关消息类型 | P1 |
| `agent-runtime/backends/interface.go` | 可选：定义 Backend 接口新增 SendToolResult 方法 | P1 |
| 预设数据/种子脚本 | 创建"问题拆分专家"Agent Profile | P1 |
| `webui/src/components/TaskForm.tsx` | 可选：新增"模糊拆分"按钮 | P2 |

---

## 11. 实施步骤

建议分 3 个阶段实施：

### 阶段 1：核心链路打通 (P0)

```
第 1 步: 补全 3 个 Executor (workflow.go)
  工作量: ~60 行 × 3
  测试: go build ./...

第 2 步: 新增 Harness HTTP API (node_agent_handler.go + main.go)
  工作量: ~80 行
  测试: curl 调用 /api/node/tool-call

第 3 步: Runtime tool_call 拦截 (runtime.go + claude_cli.go)
  工作量: ~120 行
  测试: 创建一个自动任务 session，确认 tool_call 被拦截并执行
```

### 阶段 2：自动推进与分发 (P1)

```
第 4 步: DAGEngine.OnTaskCompleted (dag.go)
  工作量: ~80 行
  测试: 创建子任务 DAG，确认完成一个后自动推进下游

第 5 步: 子任务自动派发逻辑
  工作量: ~100 行
  测试: 创建带 assignee 的子任务，确认自动派发
```

### 阶段 3：用户体验完善 (P2)

```
第 6 步: 问题拆分专家 Agent Profile + System Prompt
  工作量: 预设数据

第 7 步: 一键入口 API FuzzySplit (workflow.go)
  工作量: ~60 行
  测试: curl POST /api/tasks/fuzzy-split

第 8 步: 工作流上下文注入到执行 Agent Prompt
  工作量: ~40 行

第 9 步: 前端可选优化
  工作量: 可选
```

### 依赖关系

```
阶段 1 全部完成 → 阶段 2 开始
阶段 2 全部完成 → 阶段 3 开始

每阶段内步骤可按编号顺序执行，但步骤间无严格依赖。
```

---

## 附录：关键数据结构

### AgentContext (已有)

```go
type AgentContext struct {
    AgentID        string   // agent profile ID
    AgentName      string
    WorkflowID     *string
    TaskID         string
    Depth          int
    MaxDepth       int
    Permissions    []string
    Capabilities   []string
    TokenBudget    int64
    TokensUsed     int64
}
```

### ToolCall (已有)

```go
type ToolCall struct {
    Type   string          `json:"type"`   // "tool_call"
    Tool   string          `json:"tool"`
    Params json.RawMessage `json:"params"`
    ID     string          `json:"id,omitempty"`
}
```

### ToolResult (已有)

```go
type ToolResult struct {
    Type   string      `json:"type"`   // "tool_result"
    Tool   string      `json:"tool"`
    ID     string      `json:"id,omitempty"`
    Status string      `json:"status"`   // success | denied | error
    Result interface{} `json:"result,omitempty"`
    Error  *ToolError  `json:"error,omitempty"`
}
```

### DAGEngine.OnTaskCompleted (新增)

```go
// OnTaskCompleted is called when a task transitions to completed/done.
// It checks downstream dependencies and unblocks any tasks whose
// dependencies are all satisfied.
func (e *DAGEngine) OnTaskCompleted(workflowID, taskID string) {
    // 1. Get all tasks that depend on this task
    // 2. For each downstream task, check if ALL dependencies are completed
    // 3. If all deps completed → set task status to 'todo'
    // 4. If task has an assignee agent → trigger dispatch
}
```
