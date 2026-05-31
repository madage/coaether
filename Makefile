.PHONY: all build-server build-agent build-webui clean dev-server dev-webui

all: build-server build-agent

# === Server ===
build-server:
	cd server && go build -o bin/myai-server .

# === Agent Node (all platforms) ===
build-agent:
	$(MAKE) -C agent-node build-all

build-agent-darwin:
	cd agent-node && GOOS=darwin GOARCH=amd64 go build -o builds/agent-node-darwin-amd64 .
	cd agent-node && GOOS=darwin GOARCH=arm64 go build -o builds/agent-node-darwin-arm64 .

build-agent-linux:
	cd agent-node && GOOS=linux GOARCH=amd64 go build -o builds/agent-node-linux-amd64 .

build-agent-windows:
	cd agent-node && GOOS=windows GOARCH=amd64 go build -o builds/agent-node-windows-amd64.exe .

# === Web UI ===
build-webui:
	cd webui && npm install && npm run build

# === Dev ===
dev-server:
	cd server && go run .

dev-webui:
	cd webui && npm run dev

# === Clean ===
clean:
	rm -rf server/bin/*
	rm -rf agent-node/builds/*
	rm -rf webui/dist/*
