# Claude Code Stream-JSON 协议集成技术报告

## 1. 背景

在 `superco` 项目中，`agent-runtime` 需要与本地安装的 `claude` CLI（Claude Code）集成，以提供完整的 AI 编程助手功能。目标是通过标准输入输出（stdio）与 `claude` 进程通信，获取结构化 JSON 输出，并在此基础上构建可扩展的架构。

## 2. 调研过程

### 2.1 PTY 方案（已废弃）

最初尝试通过 PTY（伪终端）启动 `claude`，直接与终端 UI（TUI）交互。

**问题：**
- `claude` 默认启动交互式 TUI，输出包含大量终端控制序列
- macOS PTY 文件描述符不支持 `SetReadDeadline`，需要使用 `syscall.SetNonblock`
- TUI 输出非结构化，难以解析
- 初始启动 drain 循环可能因持续输出而无限阻塞

### 2.2 `--print` 方案（中间态）

使用 `claude --print "prompt"` 模式快速获得纯文本回复。

**局限性：**
- 每次调用启动新进程，无对话历史
- 无法使用工具（Bash、文件编辑等）
- 失去 Claude Code 核心功能

### 2.3 Stream-JSON 方案（选定）

通过 `claude --print --output-format stream-json --verbose` 启动 `claude`，可以：

- 获得结构化 JSON Lines 输出
- 保留完整 Claude Code 功能（工具调用、MCP 服务器等）
- 支持当前配置的任何 LLM 提供商（DeepSeek、Anthropic 等）
- 可通过 `--input-format stream-json` 实现流式 JSON 输入（待验证）

## 3. Stream-JSON 协议详解

### 3.1 启动命令

```bash
claude --print --output-format stream-json --verbose
```

- `--print`：非交互模式，处理输入后输出结果
- `--output-format stream-json`：输出 JSON Lines 格式
- `--verbose`：必须与 `stream-json` 配合使用

可选附加参数：

| 参数 | 说明 |
|------|------|
| `--permission-prompt-tool stdio` | 工具权限提示通过 stdio 交互 |
| `--input-format stream-json` | 输入支持流式 JSON 格式 |
| `--append-system-prompt <text>` | 注入额外系统提示 |
| `--dangerously-skip-permissions` | 跳过所有权限检查 |
| `--model <model>` | 指定模型 |

### 3.2 输出格式

stdout 输出 JSON Lines，每行一个完整 JSON 对象。换行符（`\n`）分隔。

#### 3.2.1 `system.init` — 初始化事件

`claude` 启动后第一个事件，包含完整的会话元数据。

```json
{
  "type": "system",
  "subtype": "init",
  "cwd": "/Users/xxx/project",
  "session_id": "ac613557-35af-42d3-9c63-f42c3b728c8d",
  "tools": [
    "Task",
    "AskUserQuestion",
    "Bash",
    "CronCreate",
    "CronDelete",
    "CronList",
    "Edit",
    "EnterPlanMode",
    "EnterWorktree",
    "ExitPlanMode",
    "ExitWorktree",
    "Glob",
    "Grep",
    "ListMcpResourcesTool",
    "NotebookEdit",
    "Read",
    "ReadMcpResourceTool",
    "ScheduleWakeup",
    "Skill",
    "TaskCreate",
    "TaskGet",
    "TaskList",
    "TaskOutput",
    "TaskStop",
    "TaskUpdate",
    "WebFetch",
    "WebSearch",
    "Write",
    "mcp__zhihu__*"
  ],
  "mcp_servers": [
    {"name": "zhihu", "status": "connected"},
    {"name": "zhihu-search", "status": "connected"}
  ],
  "model": "deepseek-v4-flash",
  "permissionMode": "default",
  "claude_code_version": "2.1.143",
  "apiKeySource": "none",
  "plugins": [
    {"name": "document-skills", "path": "/Users/xxx/.claude/plugins/..."}
  ],
  "analytics_disabled": true,
  "fast_mode_state": "off"
}
```

**关键字段：**
- `session_id`：当前会话唯一标识
- `tools`：所有可用工具列表（内置工具 + MCP 工具）
- `mcp_servers`：已连接的 MCP 服务器及其状态
- `model`：当前使用的模型（如 `deepseek-v4-flash`）
- `claude_code_version`：Claude Code 版本号

#### 3.2.2 `assistant` — 助手回复事件

一个请求可能产生多个 `assistant` 事件。包含 `content` 数组，每个元素是一种内容块。

##### Text 块

```json
{
  "type": "assistant",
  "message": {
    "id": "msg-xxx",
    "type": "message",
    "role": "assistant",
    "model": "deepseek-v4-flash",
    "content": [
      {
        "type": "text",
        "text": "Hello! How can I help you today?"
      }
    ],
    "stop_reason": "end_turn",
    "usage": {
      "input_tokens": 25892,
      "output_tokens": 33
    }
  },
  "session_id": "ac613557-35af-42d3-9c63-f42c3b728c8d",
  "uuid": "d626b29b-4b8b-431c-91d3-2653e7c001df"
}
```

##### Thinking 块（推理过程）

```json
{
  "type": "assistant",
  "message": {
    "id": "msg-xxx",
    "content": [
      {
        "type": "thinking",
        "thinking": "The user is greeting me. I'll respond in a friendly manner.",
        "signature": "msg-xxx"
      }
    ],
    "stop_reason": null
  }
}
```

##### Tool Use 块（工具调用）

```json
{
  "type": "assistant",
  "message": {
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_xxx",
        "name": "Bash",
        "input": {
          "command": "ls -la"
        }
      }
    ]
  }
}
```

#### 3.2.3 `result` — 结果/完成事件

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 1948,
  "duration_api_ms": 1909,
  "ttft_ms": 1864,
  "num_turns": 1,
  "result": "Hello! How can I help you today?",
  "stop_reason": "end_turn",
  "session_id": "ac613557-35af-42d3-9c63-f42c3b728c8d",
  "total_cost_usd": 0.1302,
  "usage": {
    "input_tokens": 25892,
    "output_tokens": 33
  },
  "modelUsage": {
    "deepseek-v4-flash": {
      "inputTokens": 25892,
      "outputTokens": 33,
      "costUSD": 0.1302
    }
  },
  "permission_denials": [],
  "terminal_reason": "completed",
  "fast_mode_state": "off"
}
```

**关键字段：**
- `duration_ms`：总耗时（毫秒）
- `ttft_ms`：首 token 耗时（毫秒）
- `total_cost_usd`：总费用（USD）
- `usage`：token 用量
- `stop_reason`：停止原因（`end_turn`/`tool_use`/`max_tokens`）

#### 3.2.4 事件序列

```
system.init     → claude 启动完成
assistant       → 推送 thinking/text/tool_use 内容（可能多个）
assistant       → 最终回复
result          → 处理完成
```

### 3.3 输入格式

#### 3.3.1 纯文本输入（当前方案）

直接将用户文本写入 claude 的 stdin，以 `\n` 结尾。claude 会自动识别并处理。

```
你的问题或指令是什么？
```

#### 3.3.2 Stream-JSON 输入（扩展方案）

通过 `--input-format stream-json` 启用，发送结构化 JSON 到 stdin。

```json
{"type": "message", "content": "你的问题"}
{"type": "message", "content": "后续消息（维持对话上下文）"}
```

注意：当前测试表明 `--input-format stream-json` 格式尚未完全确定，需进一步反查 cc-connect 源码。

## 4. 架构设计

### 4.1 系统架构

```
┌──────────┐  WebSocket  ┌────────────────┐  stdin/stdout  ┌──────────────┐
│          │  Message Bus │                │  JSON Lines    │              │
│  Web UI  │◄───────────►│  agent-runtime │◄──────────────►│  claude CLI  │
│  (React) │              │  (Go Backend)  │  stream-json   │  (ClaudeCode)│
│          │              │                │                │              │
└──────────┘              └────────────────┘                └──────────────┘
```

- **Web UI**：用户界面，通过 Message Bus 与后端通信
- **agent-runtime**：Go 语言后端，管理 claude 子进程生命周期的 JSON 流解析
- **claude CLI**：Claude Code 进程，通过 stdin/stdout 与运行时通信

### 4.2 进程模型

每个会话（session）维护一个独立的 claude 子进程：

```
Session A → claude process A (PID 12345)
Session B → claude process B (PID 12346)
Session C → claude process C (PID 12347)
```

- 进程在会话创建时启动
- 会话结束后发送 SIGTERM 清理
- 5 分钟无活动自动超时回收
- 每个 claude 进程约占用 200-400MB 内存

### 4.3 JSON 流解析器设计

```
stdout (JSON Lines)
     │
     ▼
  bufio.Scanner (按行分割)
     │
     ▼
  json.Unmarshal → 判断 type
     │
     ├── system.init  → 保存元数据(session_id, tools, model)
     ├── assistant    → 提取 content 块
     │     ├── thinking → 实时转发（进度指示）
     │     ├── text     → 转发给前端
     │     └── tool_use → 暂存（扩展接口）
     └── result       → 发送完成信号 + token 统计
```

## 5. 关键发现

### 5.1 macOS PTY 限制

macOS 的 PTY 文件描述符不支持 `SetReadDeadline`，调用返回错误 `"file type does not support deadline"`。

**影响：**
- 所有基于 PTY 的 read timeout 机制都会失效
- Read 调用会无限阻塞，永远不超时

**解决方案：**
- 使用 `syscall.SetNonblock(int(fd), true)` 设置为非阻塞模式
- 非阻塞模式下 Read 返回 `EAGAIN` 表示无数据
- 配合 `time.Sleep` + 轮询实现 timeout 逻辑

### 5.2 Stream-JSON 前提条件

- `--output-format stream-json` **必须**与 `--print` 配合使用
- `stream-json` + `--print` **必须**搭配 `--verbose`
- 不带 `--print` 时 `--output-format stream-json` 会报错

### 5.3 资源占用

- 单个 claude 进程基础内存占用约 200-400MB
- 进程启动时间约 1-3 秒
- 首 token 耗时（TTFT）受模型和网络影响，通常 1-3 秒

## 6. 扩展能力

### 6.1 MCP 服务器

claude 启动时自动加载 `~/.claude/settings.json` 中配置的 MCP 服务器。`system.init` 的 `mcp_servers` 和 `tools` 字段会列出所有可用的 MCP 工具。无需额外配置即可使用。

### 6.2 自定义 System Prompt

通过 `--append-system-prompt` 参数注入自定义系统指令，实现：
- 自定义行为约束和工作流程
- 添加自定义工具描述
- 注入通信协议指令（类似 cc-connect）

### 6.3 工具调用拦截

`assistant` 事件中的 `tool_use` 块可以被拦截并路由到：
- 自定义执行器（如 webhook）
- 用户确认界面（前端）
- 其他 AI agent（bot-to-bot relay）

## 7. 当前状态

截至 2026-05-31：

- ✅ `claude --print --output-format stream-json --verbose` 已验证可用
- ✅ JSON Lines 输出格式已确认
- ✅ 可用工具列表、模型信息、MCP 服务器信息可从 `system.init` 获取
- ❌ PTY 方案因 macOS 限制已废弃
- ❌ `--input-format stream-json` 输入格式需进一步验证
- ❌ 持久子进程管理尚未实现
- ❌ 工具调用处理尚未实现
