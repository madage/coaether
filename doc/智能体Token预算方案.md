# 智能体 Token 预算 + 任务卡片实时显示

## 背景

用户需要两个关联功能：
1. **Token 预算上限**：给每个智能体设置每次执行任务的 token 消耗上限，超过时暂停任务
2. **任务卡片 Token 显示**：任务执行时，卡片上实时显示 token 消耗进度

## 设计决策

Runtime 端作为主执行点（类比 `max_agent_loops`），服务端 Harness 作为兜底防线。

**为什么 Runtime 主控**：
- 和现有 `max_agent_loops`/`max_depth` 模式一致 — 都是 Runtime 本地执行资源限制
- 零延迟响应 — LLM 调用完成后立即判断，不多浪费一次调用
- 网络隔离 — 不依赖服务端可达性

**为什么 Harness 兜底**：
- Runtime 因 bug 未停时，tool_call 在服务端被硬拦截
- 策略热更新 — 用户改了 token_budget 后，Harness 立即生效（但正常路径下次 session 才生效）

---

## 1. 数据模型

### 1.1 AgentProfile — 新增字段

**`server/models/agent_profile.go`**：
```go
TokenBudget int64 `json:"token_budget"` // 0 = unlimited
```

**`server/database/database.go`** — 迁移：
```sql
ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS token_budget BIGINT NOT NULL DEFAULT 0;
```

### 1.2 Task — 新增冗余字段

**`server/models/task.go`**：
```go
TokensUsed  int64 `json:"tokens_used"`   // 当前任务累计消耗
TokenBudget int64 `json:"token_budget"`  // 从 agent_profile 复制，任务创建时快照
```

好处：前端 TaskCard 列表渲染无需额外 JOIN/查询，直接从 Task 对象读取。

**`server/database/database.go`** — 迁移：
```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tokens_used BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS token_budget BIGINT NOT NULL DEFAULT 0;
```

### 1.3 TokenUsage 表 — 已存在，无需改动

```sql
token_usage (id, workflow_id, task_id, agent_profile_id, session_id,
             prompt_tokens, completion_tokens, total_tokens, stage, created_at)
```

---

## 2. 协议层

### 2.1 Session Create 下发 token_budget

**`server/handlers/bus_handler.go`** — 在构造 `MsgSessionCreate` envelope 时，context 中追加：
```go
"token_budget": profile.TokenBudget,
```

当前 context 已有：`task_id`, `queue_id`, `agent_profile_id`, `is_auto_task`。token_budget 加入同一 context map。

### 2.2 新增 WebSocket 事件（用于前端实时更新）

不需要新增协议类型。Token 上报后服务端通过现有的 `session` 事件通道广播 token 更新。

或者更简单：前端通过 WebSocket 的 `session` 事件获取 task 状态变化，task 状态变化时重新拉取 task 详情（包含 `tokens_used`、`token_budget`）。

---

## 3. Runtime 端 — 主执行点

### 3.1 数据结构扩展

**`agent-runtime/runtime.go`** — Runtime struct：
```go
type Runtime struct {
    // ... 现有字段 ...
    sessionTokens   map[string]int64          // sessionID → 累计 tokens
    sessionBudget   map[string]int64          // sessionID → token_budget
    sessionMu       sync.Mutex
}
```

### 3.2 Session Create 时记录预算

**`runtime.go`** — `handleMessage` 的 `MsgSessionCreate` 分支（约 180 行）：
```
从 env.Payload.Context 中提取 token_budget
存入 r.sessionBudget[sessionID]
初始化 r.sessionTokens[sessionID] = 0
```

### 3.3 Token 累加 + 预算检查

**`claude.go`** — `HandleMessage` 中已有 `result.Usage.InputTokens` / `OutputTokens`。将这些值放入返回的 Envelope Metadata：
```go
// 在 NewEnvelope 的 Payload.Metadata 中加入:
"token_input":  result.Usage.InputTokens,
"token_output": result.Usage.OutputTokens,
```

**`runtime.go`** — `handleAgentMessage`（约 256 行），调用 backend 后：
```go
resp, err := backend.HandleMessage(env)
// ... 发送 resp ...

// 提取 token 并检查预算
if resp != nil && resp.Payload != nil && resp.Payload.Metadata != nil {
    input, _ := resp.Payload.Metadata["token_input"].(float64)
    output, _ := resp.Payload.Metadata["token_output"].(float64)
    r.reportAndCheckTokens(env.SessionID, int64(input), int64(output))
}
```

**`runtime.go`** — 新增 `reportAndCheckTokens`：
```go
func (r *Runtime) reportAndCheckTokens(sessionID string, input, output int64) {
    total := input + output
    if total == 0 { return }

    r.sessionMu.Lock()
    r.sessionTokens[sessionID] += total
    current := r.sessionTokens[sessionID]
    budget := r.sessionBudget[sessionID]
    exceeded := budget > 0 && current >= budget
    r.sessionMu.Unlock()

    // 异步上报服务端（不阻塞 LLM 响应）
    go r.reportTokenUsage(sessionID, input, output, total)

    if exceeded {
        log.Printf("[Runtime] Token budget exceeded for session %s: %d/%d", sessionID[:8], current, budget)
        // 1. 停止当前 session（终止 Claude CLI 进程）
        if cli, ok := r.backends["claude"].(*backends.ClaudeCLIBackend); ok {
            cli.CloseSession(sessionID)
        }
        // 2. 通知服务端 block 任务
        r.handleTokenBudgetExceeded(sessionID, current, budget)
    }
}
```

### 3.4 上报 Token Usage

**`runtime.go`** — 新增 `reportTokenUsage`：
```go
func (r *Runtime) reportTokenUsage(sessionID string, input, output, total int64) {
    r.connMu.Lock()
    meta, ok := r.sessionMeta[sessionID]
    r.connMu.Unlock()
    if !ok { return }

    baseURL := "http://" + r.ServerURL
    auth := fmt.Sprintf("node_id=%s&node_secret=%s", r.NodeID, r.Secret)

    body := map[string]interface{}{
        "task_id":           meta["task_id"],
        "agent_profile_id":  meta["agent_profile_id"],
        "session_id":        sessionID,
        "prompt_tokens":     input,
        "completion_tokens": output,
        "total_tokens":      total,
        "stage":             "work",
    }
    bodyBytes, _ := json.Marshal(body)
    u := fmt.Sprintf("%s/api/node/token-usage?%s", baseURL, auth)
    resp, err := http.Post(u, "application/json", bytes.NewBuffer(bodyBytes))
    if err != nil {
        log.Printf("[Runtime] Token report failed: %v", err)
        return
    }
    resp.Body.Close()
}
```

### 3.5 超限处理

**`runtime.go`** — 新增 `handleTokenBudgetExceeded`：
```go
func (r *Runtime) handleTokenBudgetExceeded(sessionID string, used, budget int64) {
    r.connMu.Lock()
    meta, ok := r.sessionMeta[sessionID]
    r.connMu.Unlock()
    if !ok { return }

    baseURL := "http://" + r.ServerURL
    auth := fmt.Sprintf("node_id=%s&node_secret=%s", r.NodeID, r.Secret)

    // 1. 标记 queue 为 blocked
    queueID := meta["queue_id"]
    body := map[string]string{
        "status":         "blocked",
        "result_summary": fmt.Sprintf("Token budget exceeded: %d/%d", used, budget),
    }
    bodyBytes, _ := json.Marshal(body)
    u := fmt.Sprintf("%s/api/node/queue/%s/status?%s", baseURL, queueID, auth)
    req, _ := http.NewRequest("PUT", u, bytes.NewBuffer(bodyBytes))
    req.Header.Set("Content-Type", "application/json")
    resp, err := http.DefaultClient.Do(req)
    if err == nil {
        resp.Body.Close()
        log.Printf("[Runtime] Queue %s blocked (token budget)", queueID[:8])
    }

    // 2. 发系统评论
    taskID := meta["task_id"]
    agentProfileID := meta["agent_profile_id"]
    commentBody := map[string]string{
        "content":          fmt.Sprintf("⚠️ Token 预算耗尽：已消耗 %d tokens（上限 %d）。任务已暂停，请调整预算后重试。", used, budget),
        "agent_profile_id": agentProfileID,
        "queue_id":         queueID,
    }
    commentBytes, _ := json.Marshal(commentBody)
    commentURL := fmt.Sprintf("%s/api/node/tasks/%s/comments?%s", baseURL, taskID, auth)
    req2, _ := http.NewRequest("POST", commentURL, bytes.NewBuffer(commentBytes))
    req2.Header.Set("Content-Type", "application/json")
    resp2, err := http.DefaultClient.Do(req2)
    if err == nil {
        resp2.Body.Close()
    }

    // 3. 清理
    r.sessionMu.Lock()
    delete(r.sessionTokens, sessionID)
    delete(r.sessionBudget, sessionID)
    r.sessionMu.Unlock()
}
```

---

## 4. 服务端

### 4.1 ReportTokenUsage 扩展

**`server/handlers/node_agent_handler.go`** — 现有 `ReportTokenUsage`（862 行附近）：

除了 INSERT 记录外，新增：更新 `tasks.tokens_used`：
```go
h.DB.Exec(`UPDATE tasks SET tokens_used = tokens_used + $1
    WHERE id = $2`, req.TotalTokens, req.TaskID)
```

无需在服务端做预算检查（Runtime 已做），只负责记录 + 统计。

### 4.2 CreateSession — 下发 token_budget

**`server/handlers/bus_handler.go`** 或创建 session 的 handler 中：

查询 agent_profile 的 token_budget，放入 session context：
```go
var tokenBudget int64
h.DB.QueryRow(`SELECT token_budget FROM agent_profiles WHERE id = $1`,
    req.AgentID).Scan(&tokenBudget)

context["token_budget"] = tokenBudget
```

同时初始化 task 的 token_budget 快照：
```go
h.DB.Exec(`UPDATE tasks SET token_budget = $1 WHERE id = $2`,
    tokenBudget, req.TaskID)
```

### 4.3 Agent Profile CRUD — 支持 token_budget

**`server/handlers/agent_profile.go`** — create/update 请求体：
```go
TokenBudget int64 `json:"token_budget,omitempty"`
```

### 4.4 Harness 兜底检查

**`server/harness/policy.go`** — 新增 `checkTokenBudget`：

在 `HandleToolCall` 的 Policy Check 阶段调用，返回 `PolicyCheck`：
```go
func (p *PolicyEngine) checkTokenBudget(ctx *AgentContext) *PolicyCheck {
    if ctx.TaskID == "" { return &PolicyCheck{Allowed: true} }
    
    var used, budget int64
    p.DB.QueryRow(`SELECT COALESCE(tokens_used, 0), COALESCE(token_budget, 0)
        FROM tasks WHERE id = $1`, ctx.TaskID).Scan(&used, &budget)
    
    if budget > 0 && used >= budget {
        return &PolicyCheck{
            Allowed: false,
            Reason:  "token_budget_exceeded",
            Code:    "TOKEN_BUDGET_EXCEEDED",
            Message: fmt.Sprintf("Token budget exhausted: %d/%d", used, budget),
        }
    }
    return &PolicyCheck{Allowed: true}
}
```

---

## 5. 前端

### 5.1 类型扩展

**`webui/src/types/index.ts`**：
```ts
interface AgentProfile {
  // ... existing ...
  token_budget?: number; // 0 = unlimited
}

interface Task {
  // ... existing ...
  tokens_used?: number;
  token_budget?: number;
}
```

### 5.2 Agent 设置 — token_budget 输入

**`webui/src/components/AgentForm.tsx`** — 新增字段：
```
Token 预算（每次任务上限）
[________5000_______]  0 = 不限制
```

**`webui/src/components/AgentDetailModal.tsx`** — 同上，编辑模式。

**`webui/src/api/client.ts`** — create/update 的 data 类型增加 `token_budget?`。

### 5.3 任务卡片 — Token 进度条

**`webui/src/components/TaskCard.tsx`** — 当 `task.token_budget > 0 && task.status === 'in_progress'` 时：

```
┌──────────────────────────────────────┐
│ ···                       🔵 in_progress │
│                                      │
│ 实现用户登录功能                       │
│                                      │
│ 💰 2,300 / 5,000 ████████░░░░ 46%   │  ← 新增
│ 👤 前端助手     📅 06/20             │
└──────────────────────────────────────┘
```

颜色逻辑：
- `< 50%`：绿色 `#4caf50`
- `50-80%`：黄色 `#ff9800`
- `> 80%`：红色 `#f44336` + 脉冲动画

预算为 0 时不显示。

### 5.4 i18n

```ts
// zh.ts
tokenBudget: 'Token 预算',
tokenBudgetHint: '每次任务允许的 token 消耗上限，0 表示不限制',
tokensUsed: '已消耗',
tokenBudgetExceeded: 'Token 预算耗尽',

// en.ts  
tokenBudget: 'Token Budget',
tokenBudgetHint: 'Max tokens allowed per task execution, 0 for unlimited',
tokensUsed: 'Tokens Used',
tokenBudgetExceeded: 'Token Budget Exceeded',
```

---

## 6. 完整数据流

```
1. 用户创建/编辑智能体 → 设置 token_budget = 5000
                              ↓
2. 任务分配给该智能体 → 服务端创建 session
   context: { task_id, agent_profile_id, token_budget: 5000, ... }
                              ↓
3. Runtime 收到 MsgSessionCreate → 记录 sessionBudget[sid] = 5000
                              ↓
4. LLM 第1次调用 → 返回 usage: { input: 800, output: 400 }
   → Runtime: sessionTokens[sid] += 1200 → 1200/5000 ✓ 继续
   → 异步上报 POST /api/node/token-usage
                              ↓
5. LLM 第2次调用 → usage: { input: 1000, output: 600 }
   → Runtime: sessionTokens[sid] += 1600 → 2800/5000 ✓ 继续
                              ↓
6. LLM 第3次调用 → usage: { input: 1500, output: 800 }
   → Runtime: sessionTokens[sid] += 2300 → 5100/5000 ✗ 超限!
   → 立即停止 Claude CLI session
   → POST queue/status → blocked
   → POST 系统评论 "Token 预算耗尽: 5100/5000"
   → 清理 sessionTokens/Budget
                              ↓
7. 服务端: tasks.tokens_used 更新为最后一次上报值
   前端: 任务卡片刷新 → 状态变为 blocked → 显示 token 使用信息
```

---

## 涉及文件清单

| 文件 | 改动 | 风险 |
|------|------|------|
| `server/models/agent_profile.go` | +1 字段 | LOW |
| `server/models/task.go` | +2 字段 | LOW |
| `server/database/database.go` | +3 ALTER TABLE | LOW (IF NOT EXISTS) |
| `server/handlers/agent_profile.go` | create/update 支持 token_budget | LOW |
| `server/handlers/bus_handler.go` | session context 下放 token_budget | LOW |
| `server/handlers/node_agent_handler.go` | ReportTokenUsage 中更新 tasks.tokens_used | LOW |
| `server/harness/policy.go` | 新增 checkTokenBudget | LOW |
| `agent-runtime/runtime.go` | +sessionTokens/Budget maps, +reportAndCheckTokens, +reportTokenUsage, +handleTokenBudgetExceeded, 修改 handleAgentMessage | MEDIUM |
| `agent-runtime/backends/claude.go` | envelope metadata 中加 token_input/output | LOW |
| `agent-runtime/backends/claude_cli.go` | 同上（从 stream-json 最后一帧提取 usage） | MEDIUM |
| `webui/src/types/index.ts` | AgentProfile + Task 类型扩展 | LOW |
| `webui/src/components/AgentForm.tsx` | token_budget 输入框 | LOW |
| `webui/src/components/AgentDetailModal.tsx` | token_budget 编辑 | LOW |
| `webui/src/components/TaskCard.tsx` | token 进度条 | LOW |
| `webui/src/api/client.ts` | create/update 类型加 token_budget | LOW |
| `webui/src/i18n/zh.ts` | +4 keys | LOW |
| `webui/src/i18n/en.ts` | +4 keys | LOW |

---

## 验证

1. **构建后端**: `cd server && go build -o server.exe .`
2. **构建前端**: `cd webui && npm run build`
3. **构建 runtime**: `cd agent-runtime && go build -o agent-runtime.exe .`
4. **功能测试**:
   - 创建/编辑智能体 → 设置 token_budget = 1000
   - 给该智能体分配任务 → 观察 runtime 日志中的 token 累加
   - 当累计超过 1000 → 验证任务状态变为 blocked，系统评论出现
   - task_budget = 0 时正常执行不受限
5. **前端验证**:
   - 智能体详情/创建页有 token_budget 输入框
   - 任务卡片在处理中时显示 token 进度条
   - 不同百分比显示不同颜色
