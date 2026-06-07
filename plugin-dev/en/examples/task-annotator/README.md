# Task Annotator Plugin

A complete CoAether plugin example demonstrating real-world plugin development patterns.

## Features Demonstrated

| Feature | File | Description |
|---------|------|-------------|
| Plugin Manifest | `plugin.json` | Complete capability and permission declarations |
| SQLite Storage | `main.go` | Creates an independent database in the plugin's data_dir |
| Hook Handling | `main.go` | Listens for task:created to auto-create annotation placeholders |
| Business API | `main.go` | CRUD annotation REST API |
| Host API | `main.go:callHost()` | Plugin calls back to the host to query data |
| Frontend Component | `frontend/` | Task detail tab showing annotation editing UI |
| Database Migrations | `migrations/` | SQL migration files |

## File Structure

```
task-annotator-1_0_0/
├── plugin.json              # Plugin manifest
├── task-annotator           # Compiled binary
├── migrations/
│   └── 001_create_annotations.sql
└── frontend/
    └── dist/
        ├── index.js
        └── style.css
```

## API Endpoints

The plugin is registered under `/api/plugins/task-annotator/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/annotations?task_id=xxx` | GET | Query annotations for a task |
| `/annotations` | POST | Create/Update an annotation |
| `/annotations/{id}` | DELETE | Delete an annotation |

Example request:

```bash
# Create/Update an annotation
curl -X POST http://localhost:8080/api/plugins/task-annotator/annotations \
  -H "Content-Type: application/json" \
  -d '{"task_id": "xxx", "content": "Needs attention", "color": "#f44336"}'

# Query annotations
curl http://localhost:8080/api/plugins/task-annotator/annotations?task_id=xxx
```

## Installation

```bash
# Build
cd task-annotator
go build -o task-annotator .

mkdir -p /path/to/coaether/plugins/task-annotator-1_0_0/
cp task-annotator plugin.json /path/to/coaether/plugins/task-annotator-1_0_0/
cp -r migrations /path/to/coaether/plugins/task-annotator-1_0_0/

# Build frontend
cd frontend
npm install && npm run build
cp -r dist /path/to/coaether/plugins/task-annotator-1_0_0/frontend/

# Restart the main program
```
