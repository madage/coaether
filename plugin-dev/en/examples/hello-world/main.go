package main

import (
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"time"
)

// HelloWorldPlugin demonstrates the minimal CoAether plugin.
type HelloWorldPlugin struct {
	pluginID string
	dataDir  string
	startAt  time.Time
}

func main() {
	p := &HelloWorldPlugin{
		startAt: time.Now(),
	}
	p.pluginID = os.Getenv("COAETHER_PLUGIN_ID")

	mux := http.NewServeMux()

	// Lifecycle endpoints (required)
	mux.HandleFunc("/__plugin/init", p.handleInit)
	mux.HandleFunc("/__plugin/health", p.handleHealth)
	mux.HandleFunc("/__plugin/hook", p.handleHook)
	mux.HandleFunc("/__plugin/shutdown", p.handleShutdown)

	// Business API
	mux.HandleFunc("/hello", p.handleHello)
	mux.HandleFunc("/projects", p.handleProjects)

	// Start HTTP server on random port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	// Handshake: write port to stdout for the host to read
	port := listener.Addr().(*net.TCPAddr).Port
	json.NewEncoder(os.Stdout).Encode(map[string]int{"port": port})

	log.Printf("[HelloWorld] Plugin started on port %d (pid=%d)", port, os.Getpid())
	if err := http.Serve(listener, mux); err != nil {
		log.Printf("[HelloWorld] Server error: %v", err)
	}
}

func (p *HelloWorldPlugin) handleInit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PluginID  string `json:"plugin_id"`
		DataDir   string `json:"data_dir"`
		Config    string `json:"config"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	p.pluginID = req.PluginID
	p.dataDir = req.DataDir

	log.Printf("[HelloWorld] Initialized: plugin=%s dataDir=%s", p.pluginID, p.dataDir)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ready": true})
}

func (p *HelloWorldPlugin) handleHealth(w http.ResponseWriter, r *http.Request) {
	uptime := time.Since(p.startAt).Milliseconds()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"healthy":   true,
		"message":   "ok",
		"uptime_ms": uptime,
	})
}

func (p *HelloWorldPlugin) handleHook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		HookName string            `json:"hook_name"`
		Context  map[string]string `json:"context"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	log.Printf("[HelloWorld] Hook received: %s", req.HookName)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"aborted": false,
	})
}

func (p *HelloWorldPlugin) handleShutdown(w http.ResponseWriter, r *http.Request) {
	log.Println("[HelloWorld] Shutting down gracefully...")
	w.WriteHeader(200)
	go func() {
		time.Sleep(100 * time.Millisecond)
		os.Exit(0)
	}()
}

func (p *HelloWorldPlugin) handleHello(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":   "Hello from CoAether plugin!",
		"plugin_id": p.pluginID,
		"uptime_ms": time.Since(p.startAt).Milliseconds(),
	})
}

func (p *HelloWorldPlugin) handleProjects(w http.ResponseWriter, r *http.Request) {
	// Calls the host API to list projects
	hostAddr := os.Getenv("COAETHER_HOST_ADDR")
	if hostAddr == "" {
		http.Error(w, `{"error":"host address not configured"}`, 500)
		return
	}

	req, _ := http.NewRequest("GET", "http://"+hostAddr+"/__plugin_host/projects", nil)
	req.Header.Set("X-Plugin-Id", p.pluginID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, 502)
		return
	}
	defer resp.Body.Close()

	// Forward the response from host API back to the caller
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
