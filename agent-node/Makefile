.PHONY: build-all build-darwin-amd64 build-darwin-arm64 build-linux build-windows clean

BINARY_NAME = agent-node
BUILD_DIR = builds

build-all: build-darwin-amd64 build-darwin-arm64 build-linux build-windows

build-darwin-amd64:
	GOOS=darwin GOARCH=amd64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 .

build-darwin-arm64:
	GOOS=darwin GOARCH=arm64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 .

build-linux:
	GOOS=linux GOARCH=amd64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 .

build-windows:
	GOOS=windows GOARCH=amd64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-windows-amd64.exe .

clean:
	rm -rf $(BUILD_DIR)/*
