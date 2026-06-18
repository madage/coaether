# CoAether — AI Agent Distributed Orchestration Platform

A cross-platform AI Agent distributed orchestration platform that connects AI Runtimes with a Web frontend through the **Message Bus** protocol, providing multi-user workspaces, task/project management, real-time chat, and Agent configuration.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Web UI (React)                      │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Dashboard  │  │  Chat Panel  │  │  Notification   │  │
│  │  (Tasks/Prj)│  │  (Floating)  │  │  (Bell/Toast)   │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                │                    │           │
│  ┌──────┴────────────────┴────────────────────┴────────┐  │
│  │              WebSocket Client Layer                  │  │
│  │  Dashboard WS (/ws/dashboard)  +  Bus WS (/ws/bus)   │  │
│  └────────────────────────┬────────────────────────────┘  │
└───────────────────────────┼────────────────────────────────┘
                            │
                   HTTP REST + WebSocket
                            │
┌───────────────────────────┼────────────────────────────────┐
│                    Server (Go + Gin)                        │
│  ┌─────────────┐  ┌──────┴────────┐  ┌──────────────────┐  │
│  │ DashboardHub │  │  Message Bus  │  │  REST API        │  │
│  │ (Events/Sig) │  │  (Msg Router) │  │  (CRUD/Auth)     │  │
│  └─────────────┘  └──────┬────────┘  └──────────────────┘  │
│                          │                                  │
│                    ┌─────┴──────┐                           │
│                    │ PostgreSQL  │                           │
│                    └────────────┘                           │
└───────────────────────────┬────────────────────────────────┘
                            │
                   Message Bus (WebSocket)
                            │
              ┌─────────────┼─────────────┐
              │             │             │
     ┌────────┴───┐  ┌─────┴──────┐  ┌───┴────────┐
     │ Agent      │  │ Agent      │  │ Agent      │
     │ Runtime    │  │ Runtime    │  │ Runtime    │
     │ (API mode)  │  │ (CLI mode)  │  │ (Remote)    │
     └────────────┘  └────────────┘  └────────────┘
```

### Core Subsystems

| Subsystem | Role | Tech Stack |
|-----------|------|------------|
| **server/** | HTTP + WebSocket server, auth, CRUD, message routing | Go + Gin + gorilla/websocket + PostgreSQL |
| **webui/** | React SPA, Dashboard + Floating Chat | React 18 + TypeScript + Vite |
| **agent-runtime/** | AI Agent runtime, connects via Message Bus | Go, supports Claude CLI / API backends |

### Communication Architecture

The system uses a **dual WebSocket channel** architecture:

1. **Dashboard WebSocket** (`/ws/dashboard`) — Real-time UI updates (task/project change notifications, workspace signals, Toast popups). Authenticated via JWT token, connects to `DashboardHub`.
2. **Message Bus WebSocket** (`/ws/bus`) — AI Agent message routing. Frontend connections identified by `type=ui` parameter, connects to `MessageBus`, no JWT required (registers via `hello` message after connection).

---

## Features

### Multi-User Workspaces
- Role-based permission system: `owner` > `admin` > `worker` > `observer`
- Workspace switching via sidebar dropdown
- Auto-creates default workspace for new users
- Workspace-level resource isolation: tasks, projects, Agent configs, sessions

### Role Permission Matrix

| Action | owner | admin | worker | observer |
|--------|-------|-------|--------|----------|
| View workspace content | ✅ | ✅ | ✅ | ✅ |
| Create/edit tasks | ✅ | ✅ | ✅ | ❌ |
| Manage projects | ✅ | ✅ | ✅ | ❌ |
| Configure Agents | ✅ | ✅ | ❌ | ❌ |
| Manage workspace members | ✅ | ✅ | ❌ | ❌ |
| Delete workspace | ✅ | ❌ | ❌ | ❌ |
| Modify roles | ✅ | ❌ | ❌ | ❌ |

### AI Agent Chat
- Floating chat window (draggable), multi-session management
- Multiple Agent selection: configure multiple Agent Profiles, switching Agents auto-restores corresponding sessions
- Session persistence: auto-restores active sessions after page refresh
- Inter-Agent session isolation: sessions for different Agents stored and restored independently
- Rich text message rendering: code blocks, tables, Markdown, images, progress indicators
- File/image upload: supports paste and drag-and-drop
- Tool call permission control: auto mode (auto-approve) and restricted mode (manual confirmation)

### Agent Configuration System
- Custom Agent Profiles: name, avatar, description, associated runtime, model selection
- Supports CLI and API backend modes
- Automatic runtime discovery and registration
- Workspace-scoped configuration
- **Capability System** — Each agent profile has a set of capabilities (`create_sub_task`, `assign_task`, `review_task`, `add_comment`, `get_task_detail`, `list_sub_tasks`, `update_task_status`) that govern which tools the agent can use; configurable at creation and editable in the detail modal
- **Behavior Instructions** — Define communication style, tone, and guidelines per agent; injected into auto-task prompts for more natural interactions

### Task Management
- Kanban board view, status flow: `todo` → `in_progress` → `blocked` → `review` → `done`
- Link to projects, organize tasks by project
- **Agent Auto-Processing** — When a task's assignee is an agent profile and status changes to `in_progress`, the agent automatically starts working; when a non-assignee agent completes a task, the assignee agent auto-reviews the result
- **DAG Auto-Progress** — Workflow tasks advance automatically: completed tasks unblock dependents → agent tasks auto-dispatch to queue → parent auto-closes when all siblings done, recursively propagating through the DAG
- **Completion Behavior** — Tasks support `completion_behavior` (`auto_done`/`auto_review`/`sample_review`/`needs_review`) controlling whether agent completion moves the task to `done` (triggering DAG) or `review`
- **Agent Queue Status** — Task Detail sidebar shows real-time agent processing status with color-coded indicators and result summaries
- Trash mechanism: soft delete + restore + permanent delete
- Workspace isolation

### Task Management (Detail)
- **Kanban Board** — Status transitions: `todo` → `in_progress` → `blocked` → `review` → `done`
- **Task Detail** (GitHub Issue style) — Inline editing for title, description, subtask list, comments; right sidebar for status, priority, assignee, tags, due date, project
- **Three-level responsibility** — Creator → Assignee → Delegated Assignees
- **Subtasks** — Linked via `parent_id`
- **Priority levels** — `urgent` > `high` > `medium` > `low`
- **Task Comments** — Issue-style, postable by both users and agents
- Linked to projects

### Automation Rules
- **Trigger→Condition→Action** engine: "When X happens, if condition Y, execute action Z"
- **4 trigger types**: `on_comment`, `on_status_change`, `on_assignee_change`, `on_task_create`
- **5 action types**: `set_priority`, `set_status`, `set_assignee`, `add_tag`, `webhook`
- **Conditions**: `equals`, `contains`, `matches` (regex), `is_null`, `not_exists`
- **Rule management UI**: create/edit/delete/toggle with execution logs

### Project Management
- Color labels, descriptions, linked task count
- Status transitions: `planning` → `active` → `completed` / `on_hold`
- Polymorphic assignee (user or agent)
- Start/due dates support
- Trash mechanism (soft delete/restore/permanent delete)
- Workspace isolation

### Trash
- Both tasks and projects support soft delete
- Dedicated trash views (`/tasks/trash`, `/projects/trash`)
- Supports restore and permanent delete

### Workspace Invitations
- Email invitations: generates unique token links
- Invitation management: list, cancel pending invitations
- In-app notifications: bell badge notification for invited users
- Instant notifications: WebSocket real-time push for invitation events
- Accept/decline invitations
- Auto-expiry for invitations

### WebSocket Real-Time Push
- Instant notification on workspace deletion/member removal/role changes
- Toast notifications (auto-dismiss, 5 seconds)
- Dashboard auto-refresh (`useResourceSync` hook)
- Real-time invitation change sync

### Remote Node Management
- **Token-based node registration** (sole approach): generate a token via Web UI, run the install script on target machine
- Cross-platform: **macOS** (bash install script + LaunchAgent auto-start) and **Windows** (PowerShell install script + Startup folder auto-start)
- Node card management: status indicator (online/offline/busy), scan Agents, enable/disable Agents, **delete node**
- Platform selection UI: Add Node dialog with macOS/Windows tabs, auto-displays correct install command
- Cross-platform binary distribution: auto-downloads agent-runtime for the target OS/Arch
- Join token mechanism: 15-minute expiry, auto-marked as used, prevents unauthorized registration
- Real-time status sync via WebSocket

### Multi-Language
- Chinese / English bilingual UI
- Toggle via `useLang()` hook

### Log Management
- **Agent Tool Logs** — Track every tool call made by agents (tool name, parameters, status, deny reason)
- **Access Logs** — HTTP request history (method, path, status, latency, client IP)
- **Token Usage** — Monitor API token consumption by workflow/task/agent/session
- **System Events** — Aggregated view of workflow escalations, task reviews, and application events
- **Workspace-scoped isolation** — All log endpoints filter by workspace, users only see logs belonging to their workspace

### User Management
- Admin can view all users
- Supports user deletion
- JWT authentication (Access Token)

---

## Tech Stack

### Backend
- **Language**: Go 1.21+
- **Web Framework**: Gin
- **WebSocket**: gorilla/websocket (Dual channel: DashboardHub + MessageBus)
- **Database**: PostgreSQL (database/sql + lib/pq)
- **Auth**: JWT (golang-jwt v5)
- **Email**: net/smtp-based mailer

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Communication**: REST API + WebSocket (Dashboard signals + Message Bus messages)
- **State Management**: React Hooks (useState/useEffect/useCallback/useRef)
- **i18n**: Custom useLang hook + JSON language packs

### AI Runtime
- **Language**: Go
- **Backend Support**: Claude API (api mode) / Claude CLI (cli mode)
- **Protocol**: Message Bus protocol (JSON Envelope over WebSocket)
- **Session Management**: Runtime-level session isolation

---

## Message Bus Protocol

All communication uses JSON `Envelope` format:

```json
{
  "id": "msg_1234_5678",
  "from": "ui://user123/conn456",
  "to": "session://session-id",
  "type": "message",
  "session_id": "session-id",
  "payload": {
    "content": [
      { "type": "text", "content": "Hello" },
      { "type": "code", "language": "go", "content": "fmt.Println()" }
    ],
    "metadata": {}
  },
  "timestamp": 1718000000000
}
```

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `hello` / `bye` | Endpoint ↔ Bus | Connection register/unregister |
| `ping` / `pong` | Endpoint ↔ Bus | Heartbeat |
| `session.create` / `session.created` | UI → Bus → Runtime | Create new session |
| `session.join` / `session.joined` | UI → Bus → Runtime | Join existing session |
| `session.end` | Any → Bus | End session |
| `message` | Any → Bus → Target | Application messages (text/code/images) |
| `tool.use` / `tool.result` | Runtime → UI / UI → Runtime | AI tool calls and results |
| `permission.request` / `permission.response` | Runtime ↔ UI | Tool call permission confirmation |
| `event` | Runtime → Bus | Runtime event notification |

### Address Format

| Endpoint Type | Format | Example |
|---------------|--------|---------|
| UI Frontend | `ui://{userID}/{connID}` | `ui://u001/cabc123` |
| Agent Runtime | `runtime://{nodeID}/{instance}` | `runtime://tok-abc123/main` |
| System | `system://{service}` | `system://bus`, `system://api` |
| Session | `session://{sessionID}` | `session://abc-123-def` |

### Content Types

`ContentBlock` supports multiple content formats: `text`, `code`, `markdown`, `table`, `card`, `image`, `file`, `progress`, `tool_use`, `status`, `separator`.

---

## Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Users | id, username, email, password |
| `workspaces` | Workspaces | id, name, description |
| `workspace_members` | Member relationships | workspace_id, user_id, role |
| `pending_invitations` | Pending invitations | token, invitee_email, status, expires_at |
| `sessions` | AI sessions | node_id, agent_id, status, workspace |
| `messages` | Message history | session_id, envelope (JSONB) |
| `nodes` | Runtime nodes | id, name, status, ip, max_sessions |
| `agents` | Agent instances | node_id, name, command, enabled |
| `agent_profiles` | User Agent profiles | user_id, name, avatar, model, backend, system_prompt, instructions, capabilities, skills |
| `tasks` | Tasks | title, status, priority, project_id, parent_id, assignee_id, assignee_type, due_at, workspace_id, tags, completion_behavior |
| `task_assignees` | Delegated assignees | task_id, assignee_id, assignee_type |
| `task_comments` | Task comments | task_id, user_id, agent_profile_id, content, parent_id |
| `task_agent_queue` | Agent processing queue | task_id, agent_profile_id, status, trigger_type, metadata (JSONB) |
| `task_rules` | Automation rules | workspace_id, name, trigger_type, conditions (JSONB), actions (JSONB) |
| `task_rule_logs` | Rule execution logs | rule_id, task_id, trigger_event, matched |
| `projects` | Projects | name, color, status, assignee, started_at, due_at, workspace_id |
| `workflows` | Workflows | title, status, token_budget, tokens_used |

---

## API Overview

### Auth
- `POST /api/auth/register` — Register
- `POST /api/auth/login` — Login

### Workspaces
- `GET /api/workspaces` — List
- `POST /api/workspaces` — Create
- `GET /api/workspaces/:id` — Detail
- `PUT /api/workspaces/:id` — Update
- `DELETE /api/workspaces/:id` — Delete

### Workspace Members
- `GET /api/workspaces/:id/members` — List
- `POST /api/workspaces/:id/members` — Add member
- `PUT /api/workspaces/:id/members/:userId` — Update role
- `DELETE /api/workspaces/:id/members/:userId` — Remove member

### Invitations
- `POST /api/workspaces/:id/invitations` — Create invitation
- `GET /api/workspaces/:id/invitations` — List
- `DELETE /api/workspaces/:id/invitations/:invitationId` — Cancel
- `GET /api/invitations/:token` — Query (public)
- `POST /api/invitations/:token/accept` — Accept
- `POST /api/invitations/:token/decline` — Decline (public)
- `GET /api/invitations/pending` — Pending invitations

### Agent Configuration
- `GET /api/agents/profiles` — List
- `POST /api/agents/profiles` — Create
- `GET /api/agents/profiles/:id` — Detail
- `PUT /api/agents/profiles/:id` — Update
- `DELETE /api/agents/profiles/:id` — Delete
- `GET /api/agents/runtimes` — Available runtimes

### Agent Queue
- `GET /api/agents/queue` — Query queue with filters
- `POST /api/agents/auto-assign/:taskId` — Auto assign agent to task
- `POST /api/agents/queue/:id/claim` — Claim queue item
- `PUT /api/agents/queue/:id/status` — Update queue status
- `GET /api/agents/queue/agents` — Query agent load info

### Sessions
- `POST /api/sessions` — Create
- `GET /api/sessions` — List (supports `?workspace_id=` filter)
- `GET /api/sessions/:id` — Detail
- `GET /api/sessions/:id/messages` — Message history

### Tasks
- `GET /api/tasks` — List (supports `?project_id=`, `?parent_id=`, `?assignee_id=`, `?priority=`, `?tag=` filtering)
- `POST /api/tasks` — Create
- `GET /api/tasks/trash` — Trash
- `GET /api/tasks/:id` — Detail
- `PUT /api/tasks/:id` — Update
- `DELETE /api/tasks/:id` — Soft delete
- `DELETE /api/tasks/:id/force` — Permanent delete
- `POST /api/tasks/:id/restore` — Restore
- `PATCH /api/tasks/:id/status` — Update status
- `POST /api/tasks/:id/assignees` — Add delegated assignee
- `DELETE /api/tasks/:id/assignees/:assigneeId` — Remove delegated assignee
- `GET /api/tasks/:id/assignees` — Delegated assignees list
- `GET /api/tasks/:id/subtasks` — Subtasks list
- `GET /api/tasks/:id/comments` — Comments list
- `POST /api/tasks/:id/comments` — Create comment
- `DELETE /api/tasks/:id/comments/:commentId` — Delete comment
- `POST /api/tasks/:id/review` — Review task (approve/reject)

### Task Rules
- `GET /api/rules?workspace_id=` — List rules
- `POST /api/rules?workspace_id=` — Create rule
- `GET /api/rules/:id` — Get rule detail
- `PUT /api/rules/:id` — Update rule
- `DELETE /api/rules/:id` — Delete rule
- `GET /api/rules/:id/logs` — Rule execution logs

### Projects
- `GET /api/projects` — List (supports `?status=` filtering)
- `POST /api/projects` — Create
- `GET /api/projects/trash` — Trash
- `GET /api/projects/:id` — Detail
- `PUT /api/projects/:id` — Update
- `DELETE /api/projects/:id` — Soft delete
- `DELETE /api/projects/:id/force` — Permanent delete
- `POST /api/projects/:id/restore` — Restore

### Node Management
- `POST /api/nodes/token` — Generate node join token
- `GET /api/nodes/install.sh?token=` — Bash install script (macOS/Linux)
- `GET /api/nodes/install.ps1?token=` — PowerShell install script (Windows)
- `GET /api/nodes/bin/:os/:arch` — Download prebuilt agent-runtime binary
- `POST /api/nodes/register` — Node registration
- `POST /api/nodes/heartbeat` — Node heartbeat
- `GET /api/nodes` — Node list
- `GET /api/nodes/:id` — Node detail
- `GET /api/nodes/:id/agents` — Node Agent list
- `POST /api/nodes/:id/scan` — Scan node Agents
- `PATCH /api/agents/:id` — Enable/disable Agent
- `DELETE /api/nodes/:id` — Remove node

### Workflows
- `GET /api/workflows` — List workflows
- `POST /api/workflows` — Create workflow
- `GET /api/workflows/:id` — Workflow detail with task summary
- `PATCH /api/workflows/:id/status` — Update workflow status
- `GET /api/workflows/:id/tasks` — List workflow tasks
- `POST /api/workflows/attach` — Attach task to workflow

### WebSocket
- `GET /ws/dashboard?token={jwt}` — Dashboard real-time notifications
- `GET /ws/bus?type=ui&user_id={id}` — Message Bus routing

### User Management
- `GET /api/users` — User list (admin/owner)
- `DELETE /api/users/:id` — Delete user (admin/owner)

### Log Management
- `GET /api/logs/agent-tool?workspace_id=` — Agent tool call logs
- `GET /api/logs/access?workspace_id=` — HTTP access logs
- `GET /api/logs/token-usage?workspace_id=` — Token usage records
- `GET /api/logs/system-events?workspace_id=` — System event stream

> Full API documentation available in [Coaether项目API接口文档.md](Coaether项目API接口文档.md)

---

## Quick Start

### 1. Prerequisites

- Go 1.21+
- Node.js 18+
- PostgreSQL 14+

### 2. Configuration

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database

Ensure PostgreSQL is running and create the database:

```bash
createdb coaether
```

### 4. Start Backend

```bash
cd server
go run .
# Listens on :8088
# Auto-migrates database on first run
```

### 5. Start Frontend

```bash
cd webui
npm install
npm run dev
# Open http://localhost:5173
```

### 6. Add Remote Node

In the Web UI, go to Nodes page and click **Add Node**, enter a node name to generate an install command, then run it on the target machine (Mac/Windows):

**macOS:**
```bash
curl -s 'http://<server>:8088/api/nodes/install.sh?token=TOKEN' | bash
```

**Windows (PowerShell):**
```powershell
powershell -c "iex ((Invoke-WebRequest -Uri 'http://<server>:8088/api/nodes/install.ps1?token=TOKEN').Content)"
```

The install script will automatically:
- Download the agent-runtime binary for the target OS/Arch
- Install Claude Code CLI (if not already installed and npm is available)
- Create auto-start service (LaunchAgent on macOS / Startup folder on Windows)
- Start agent-runtime and connect to Message Bus

### 7. Node Runtime CLI Management

agent-runtime now supports CLI commands for management:

```bash
# Start (first-time with token, subsequent uses saved secret)
agent-runtime start -s <server>:8088 -t <token>

# Check running status
agent-runtime status

# Graceful shutdown
agent-runtime stop

# Test server connectivity
agent-runtime connect -s <server>:8088 -t <token>

# Configuration management
agent-runtime config list          # List all config
agent-runtime config set KEY=VALUE # Modify config

# Show version
agent-runtime version
```

> Agent Runtime backend registration priority: Claude CLI → Claude API (ANTHROPIC_API_KEY) → Echo (fallback)

---

## Environment Variables

### Backend (server/.env)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `POSTGRES_DSN` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/coaether?sslmode=disable` | Yes |
| `JWT_SECRET` | JWT signing key | `coaether-secret-key` | Yes |
| `PORT` | HTTP server port | `8088` | No |
| `SMTP_HOST` | SMTP server | - | Invitations |
| `SMTP_PORT` | SMTP port | `587` | No |
| `SMTP_USER` | SMTP username | - | Invitations |
| `SMTP_PASS` | SMTP password | - | Invitations |
| `SMTP_FROM` | Sender email | - | Invitations |
| `PUBLIC_URL` | Public URL (for invitation links) | `http://localhost:5173` | No |

> When SMTP is not configured, invitation links are logged to the server console and can still be used.

### Agent Runtime (~/.coaether/env)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVER_URL` | Server address | `localhost:8088` | No |
| `NODE_TOKEN` | Node registration token | - | **Yes** for first-time / No for reconnect |
| `NODE_SECRET` | Persistent secret (auto-saved after first registration) | - | No |
| `NODE_ID` | Node ID (used with secret for reconnect) | - | No |
| `RUNTIME_NAME` | Node display name | hostname | No |

> All config values can be overridden by CLI flags, e.g. `agent-runtime start -s <addr> -t <token>`.

---

## Project Structure

```
coaether/
├── server/                    # Go backend
│   ├── main.go               # Entry point: routing, dependency injection
│   ├── config/               # Configuration loading
│   ├── database/             # Database connection + migrations + schema
│   ├── handlers/             # HTTP + WebSocket handlers
│   │   ├── auth.go           # Login/Register
│   │   ├── workspace.go      # Workspace CRUD + member management + invitations
│   │   ├── session.go        # AI session management
│   │   ├── task.go           # Task CRUD + trash
│   │   ├── project.go        # Project CRUD + trash
│   │   ├── agent_profile.go  # Agent config CRUD
│   │   ├── node.go           # Runtime node management
│   │   ├── user.go           # User management
│   │   ├── ws.go             # DashboardHub (notifications/signals)
│   │   └── bus_handler.go    # Message Bus WebSocket handler
│   ├── middleware/           # Gin middleware
│   │   ├── auth.go           # JWT authentication
│   │   ├── roles.go          # Role-based access control
│   │   └── workspace_auth.go # Workspace-scoped permissions
│   ├── protocol/             # Message Bus protocol definitions + routing
│   │   ├── message.go        # Envelope, Payload, ContentBlock
│   │   ├── bus.go            # MessageBus core: endpoint/session management, routing
│   │   └── address.go        # Address parsing
│   ├── models/               # Data models
│   ├── store/                # Message persistence (PostgreSQL)
│   ├── mailer/               # Email sending
│   └── notifications/        # Notification system
│
├── webui/                    # React frontend
│   ├── src/
│   │   ├── App.tsx           # Main app: routing, auth, layout
│   │   ├── api/client.ts     # HTTP API client│   │   ├── components/       # Components
│   │   │   ├── FloatingChat.tsx    # Floating chat window
│   │   │   ├── MessageStream.tsx   # Message stream (rich text)
│   │   │   ├── InputArea.tsx       # Message input area
│   │   │   ├── AddNodeDialog.tsx   # Add node dialog (platform tabs / copy cmd)
│   │   │   ├── NodeList.tsx        # Node card list (status / Agent / delete)
│   │   │   ├── TaskBoard.tsx       # Task kanban board
│   │   │   ├── ProjectList.tsx     # Project list
│   │   │   ├── AgentDetailModal.tsx  # Agent detail & edit modal
│   │   │   ├── AgentForm.tsx         # Agent creation form
│   │   │   ├── AgentQueuePanel.tsx   # Agent queue status panel
│   │   │   ├── WorkflowList.tsx      # Workflow list
│   │   │   ├── NotificationBell.tsx # Notification bell
│   │   │   ├── AgentList.tsx       # Agent list
│   │   │   ├── Sidebar.tsx         # Sidebar
│   │   │   ├── LoginForm.tsx       # Login form
│   │   │   ├── TaskForm.tsx        # Task create/edit form
│   │   │   ├── TaskCard.tsx        # Task card
│   │   │   ├── ProjectForm.tsx     # Project form
│   │   │   ├── ProjectCard.tsx     # Project card
│   │   │   ├── ProjectDetail.tsx   # Project detail
│   │   │   ├── TrashView.tsx       # Trash (tasks & projects)
│   │   │   ├── WorkspaceMembers.tsx # Workspace member management
│   │   │   ├── PermissionDialog.tsx # Tool use permission dialog
│   │   │   ├── SessionList.tsx     # Session list
│   │   │   ├── AgentCard.tsx       # Agent card
│   │   │   ├── AgentCreateCard.tsx # Create agent card
│   │   │   ├── AgentDetailModal.tsx # Agent detail modal
│   │   │   ├── AgentForm.tsx       # Agent config form
│   │   │   ├── LangSwitcher.tsx    # Language switcher
│   │   │   ├── CreateSession.tsx   # Create session
│   │   │   └── Terminal.tsx        # Terminal component

│   │   ├── hooks/            # React Hooks
│   │   │   ├── useMessageBus.ts    # Message Bus WebSocket hook
│   │   │   ├── useDashboardWS.ts   # Dashboard WebSocket hook
│   │   │   ├── useResourceSync.ts  # Resource auto-sync
│   │   ├── i18n/             # i18n language packs
│   │   └── types/            # TypeScript type definitions
│   └── vite.config.ts
│
├── agent-runtime/            # AI Agent runtime
│   ├── main.go               # CLI entry point (Cobra)
│   ├── runtime.go            # Core: connect Message Bus, register backends
│   ├── root.go               # Root command definition
│   ├── start.go              # start command
│   ├── stop.go               # stop command: graceful shutdown
│   ├── status.go             # status command
│   ├── connect.go            # connect command: connection diagnostic
│   ├── config.go             # config command: config management
│   ├── backends/             # AI backend adapters
│   │   ├── claude_cli.go     # Claude CLI mode (stream-json, preferred)
│   │   ├── claude.go         # Claude API mode (ANTHROPIC_API_KEY)
│   │   └── echo.go           # Echo backend for testing (fallback)
│   └── bin/                  # Local build output
│       ├── darwin-arm64/
│       └── darwin-amd64/
│
├── server/
│   └── bin/
│       ├── myai-server*      # Server binary
│       ├── myai-server.exe   # Windows server binary
│       └── agents/           # Node distribution binaries
│           ├── darwin-arm64/agent-runtime
│           ├── darwin-amd64/agent-runtime
│           └── windows-amd64/agent-runtime.exe
│
└── README.md
```

---

## Development Guide

### Adding a New API Endpoint

1. Create or modify a handler in `server/handlers/`
2. Register the route in `server/main.go`
3. If workspace isolation is needed, ensure the route is in the `api` group (auto-applies `WorkspaceAuthMiddleware`)
4. Add the corresponding method in `webui/src/api/client.ts`

### Adding a New Database Table

1. Add a `CREATE TABLE` statement to the `schema` constant in `server/database/database.go`'s `Migrate()` function
2. For table modifications, add `ALTER TABLE` statements to the `alterations` slice

### Adding a New WebSocket Message Type

1. Add a message type constant in `server/protocol/message.go`
2. Handle the new message type in the corresponding handler
3. Consume it in the frontend via `useMessageBus` or `useDashboardWS`

### Internationalization

Add corresponding translation keys in `webui/src/i18n/en.ts` and `webui/src/i18n/zh.ts`, then use `t('key')` in the frontend.

---

## License

[Apache-2.0](LICENSE)
