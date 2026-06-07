# Hello World Plugin

Minimal CoAether plugin example demonstrating the most basic plugin implementation.

## Files

| File | Description |
|------|-------------|
| `plugin.json` | Plugin manifest |
| `main.go` | Plugin main program |
| `go.mod` | Go module definition |

## Build & Install

```bash
# Build
cd hello-world
go build -o hello-world .

# Install to the main program's plugins directory
mkdir -p /path/to/coaether/plugins/hello-world-1_0_0/
cp hello-world plugin.json /path/to/coaether/plugins/hello-world-1_0_0/

# Restart the main program
```

## Verification

```bash
curl http://localhost:8080/api/plugins/hello-world/hello
# → {"message":"Hello from CoAether plugin!", "plugin_id":"hello-world", "uptime_ms":1234}

curl http://localhost:8080/api/plugins/hello-world/projects
# → {"projects":[...]}
```

## Features Demonstrated

| Feature | Description |
|---------|-------------|
| Lifecycle | Init, Health, Shutdown |
| Business API | `/hello` returns a greeting message |
| Host API Call | `/projects` calls the host to query the project list |
| Logging | Standard output is automatically captured by the host |
