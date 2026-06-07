module github.com/coaether/agent-runtime

go 1.23.0

require (
	github.com/coaether/server v0.0.0
	github.com/gorilla/websocket v1.5.3
)

require (
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/spf13/cobra v1.8.0 // indirect
	github.com/spf13/pflag v1.0.5 // indirect
)

replace github.com/coaether/server => ../server
