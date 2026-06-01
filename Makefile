.PHONY: all build-server build-webui clean dev-server dev-webui

all: build-server build-webui

# === Server ===
build-server:
	cd server && go build -o bin/myai-server .

# === Web UI ===
build-webui:
	cd webui && npm install && npm run build

# === Dev ===
dev-server:
	cd server && go run .

dev-webui:
	cd webui && npm run dev

# === Agent Runtime ===
build-runtime:
	cd agent-runtime && go build -o agent-runtime .

# === Clean ===
clean:
	rm -rf server/bin/*
	rm -rf webui/dist/*
