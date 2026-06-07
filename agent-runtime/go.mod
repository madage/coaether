module github.com/coaether/agent-runtime

go 1.23.0

require (
	github.com/creack/pty v1.1.21
	github.com/gorilla/websocket v1.5.3
	github.com/coaether/server v0.0.0
	golang.org/x/term v0.30.0
)

require golang.org/x/sys v0.31.0 // indirect

replace github.com/coaether/server => ../server
