package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/superco/agent-node/client"
)

var (
	serverAddr = flag.String("server", "ws://localhost:8080/ws/node", "Backend WebSocket address")
	nodeToken  = flag.String("token", "", "Node authentication token")
	nodeName   = flag.String("name", "", "Node display name (defaults to hostname)")
	platform   = flag.String("os", "", "Override OS detection")
)

func main() {
	flag.Parse()

	log.Println("[AgentNode] Starting...")

	nc := client.NewNodeClient(*serverAddr, *nodeToken, *nodeName)
	nc.Platform = detectPlatform()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("[AgentNode] Shutting down...")
		nc.Close()
		os.Exit(0)
	}()

	if err := nc.Run(); err != nil {
		log.Fatalf("[AgentNode] Fatal error: %v", err)
	}
}

func detectPlatform() string {
	if *platform != "" {
		return *platform
	}
	// In a real build, this is detected at compile time via GOOS
	return osPlatform()
}
