# Superco — AI Agent Distributed Orchestration Platform

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

### Task Management
- Kanban board view, status flow: `todo` → `in_progress` → `blocked` → `done` → `review`
- Link to projects, organize tasks by project
- Trash mechanism: soft delete + restore + permanent delete
- Workspace isolation

### Project Management
- Color labels, descriptions
- Linked task count
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

### Multi-Language
- Chinese / English bilingual UI
- Toggle via `useLang()` hook

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
| Agent Runtime | `runtime://{nodeID}/{instance}` | `runtime://node-001/main` |
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
| `agent_profiles` | User Agent configs | user_id, name, avatar, model, backend |
| `tasks` | Tasks | title, status, project_id, workspace_id |
| `projects` | Projects | name, color, workspace_id |

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

### Sessions
- `POST /api/sessions` — Create
- `GET /api/sessions` — List (supports `?workspace_id=` filter)
- `GET /api/sessions/:id` — Detail
- `GET /api/sessions/:id/messages` — Message history

### Tasks
- `GET /api/tasks` — List
- `POST /api/tasks` — Create
- `GET /api/tasks/trash` — Trash
- `PUT /api/tasks/:id` — Update
- `DELETE /api/tasks/:id` — Soft delete
- `DELETE /api/tasks/:id/force` — Permanent delete
- `POST /api/tasks/:id/restore` — Restore
- `PATCH /api/tasks/:id/status` — Update status

### Projects
- `GET /api/projects` — List
- `POST /api/projects` — Create
- `GET /api/projects/trash` — Trash
- `PUT /api/projects/:id` — Update
- `DELETE /api/projects/:id` — Soft delete
- `DELETE /api/projects/:id/force` — Permanent delete
- `POST /api/projects/:id/restore` — Restore

### WebSocket
- `GET /ws/dashboard?token={jwt}` — Dashboard real-time notifications
- `GET /ws/bus?type=ui&user_id={id}` — Message Bus routing

### User Management
- `GET /api/users` — User list (admin/owner)
- `DELETE /api/users/:id` — Delete user (admin/owner)

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
createdb superco
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

### 6. Start Agent Runtime

```bash
cd agent-runtime
go build -o agent-runtime .
./agent-runtime
# Auto-connects to ws://localhost:8088/ws/bus
```

> The Agent Runtime requires an AI backend configuration. It defaults to Claude CLI (requires `claude` command in PATH), but can be switched to API mode via environment variables.

---

## Environment Variables

### Backend (server/.env)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `POSTGRES_DSN` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/superco?sslmode=disable` | Yes |
| `JWT_SECRET` | JWT signing key | `superco-secret-key` | Yes |
| `PORT` | HTTP server port | `8088` | No |
| `SMTP_HOST` | SMTP server | - | Invitations |
| `SMTP_PORT` | SMTP port | `587` | No |
| `SMTP_USER` | SMTP username | - | Invitations |
| `SMTP_PASS` | SMTP password | - | Invitations |
| `SMTP_FROM` | Sender email | - | Invitations |
| `PUBLIC_URL` | Public URL (for invitation links) | `http://localhost:5173` | No |

> When SMTP is not configured, invitation links are logged to the server console and can still be used.

### Agent Runtime (agent-runtime/.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `BUS_URL` | Message Bus WebSocket URL | `ws://localhost:8088/ws/bus` |
| `AGENT_BACKEND` | AI backend mode (`cli` / `api`) | `cli` |
| `API_KEY` | API key (for api mode) | - |
| `API_MODEL` | Model name (for api mode) | `claude-sonnet-4-6` |

---

## Project Structure

```
superco/
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
│   │   ├── api/client.ts     # HTTP API client
│   │   ├── components/       # Components
│   │   │   ├── FloatingChat.tsx    # Floating chat window
│   │   │   ├── MessageStream.tsx   # Message stream (rich text)
│   │   │   ├── InputArea.tsx       # Message input area
│   │   │   ├── TaskBoard.tsx       # Task kanban board
│   │   │   ├── ProjectList.tsx     # Project list
│   │   │   ├── NotificationBell.tsx # Notification bell
│   │   │   ├── AgentList.tsx       # Agent list
│   │   │   ├── Sidebar.tsx         # Sidebar
│   │   │   └── LoginForm.tsx       # Login form
│   │   ├── hooks/            # React Hooks
│   │   │   ├── useMessageBus.ts    # Message Bus WebSocket hook
│   │   │   ├── useDashboardWS.ts   # Dashboard WebSocket hook
│   │   │   ├── useResourceSync.ts  # Resource auto-sync
│   │   │   └── useLang.ts          # Internationalization
│   │   ├── i18n/             # i18n language packs
│   │   └── types/            # TypeScript type definitions
│   └── vite.config.ts
│
├── agent-runtime/            # AI Agent runtime
│   ├── main.go               # Entry point
│   ├── bus_client.go         # Message Bus client
│   ├── session.go            # Session management
│   └── backends/             # AI backend adapters
│       ├── cli.go            # Claude CLI mode
│       └── api.go            # API mode
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
