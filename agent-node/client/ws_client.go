package client

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"runtime"
	"time"

	"github.com/gorilla/websocket"
	"github.com/google/uuid"
	"github.com/superco/agent-node/platform"
)

type NodeClient struct {
	ServerURL    string
	Token        string
	NodeID       string
	Name         string
	Platform     string
	OSInfo       string
	ArchInfo     string
	conn         *websocket.Conn
	writeCh      chan []byte
	done         chan struct{}
	pty          platform.PTY
	procCtrl     platform.ProcessController
	sessionPTYs  map[string]*sessionPTY
}

type sessionPTY struct {
	pty      platform.PTY
	procCtrl platform.ProcessController
}

type registerMsg struct {
	NodeToken string `json:"node_token"`
	Name      string `json:"name"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	Version   string `json:"version"`
}

type wsMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type taskPayload struct {
	SessionID string `json:"session_id"`
	Prompt    string `json:"prompt"`
	Workspace string `json:"workspace"`
}

type outputPayload struct {
	SessionID string `json:"session_id"`
	Data      string `json:"data"`
}

type taskResultPayload struct {
	SessionID string `json:"session_id"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

func NewNodeClient(serverURL, token, name string) *NodeClient {
	hostname, _ := os.Hostname()
	if name == "" {
		name = hostname
	}

	return &NodeClient{
		ServerURL:   serverURL,
		Token:       token,
		Name:        name,
		writeCh:     make(chan []byte, 256),
		done:        make(chan struct{}),
		sessionPTYs: make(map[string]*sessionPTY),
	}
}

func (nc *NodeClient) Run() error {
	// Connect WebSocket
	url := fmt.Sprintf("%s?node_id=%s", nc.ServerURL, nc.NodeID)
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		// If first connection, register first
		return nc.connectAndRun()
	}
	nc.conn = conn

	log.Printf("[WS] Connected to %s as node %s", nc.ServerURL, nc.NodeID)

	// Write pump
	go nc.writePump()

	// Heartbeat
	go nc.heartbeat()

	// Read pump
	return nc.readPump()
}

func (nc *NodeClient) connectAndRun() error {
	// Step 1: Register with backend via HTTP
	// In MVP, we register via WebSocket after initial auth
	// For simplicity, we'll dial directly with node registration

	// For now, generate a node ID and connect
	nc.NodeID = uuid.New().String()

	q := url.Values{}
	q.Set("node_id", nc.NodeID)
	q.Set("name", nc.Name)
	q.Set("os", runtime.GOOS)
	q.Set("arch", runtime.GOARCH)
	wsURL := fmt.Sprintf("%s?%s", nc.ServerURL, q.Encode())
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	nc.conn = conn

	log.Printf("[WS] Connected with generated node ID: %s", nc.NodeID)

	go nc.writePump()
	go nc.heartbeat()

	return nc.readPump()
}

func (nc *NodeClient) writePump() {
	for {
		select {
		case msg := <-nc.writeCh:
			if err := nc.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Printf("[WS] Write error: %v", err)
				return
			}
		case <-nc.done:
			return
		}
	}
}

func (nc *NodeClient) heartbeat() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := nc.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-nc.done:
			return
		}
	}
}

func (nc *NodeClient) readPump() error {
	defer nc.Close()

	for {
		_, msgBytes, err := nc.conn.ReadMessage()
		if err != nil {
			log.Printf("[WS] Read error: %v", err)
			return err
		}

		var msg wsMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "task":
			nc.handleTask(msg.Payload)
		case "input":
			nc.handleInput(msg.Payload)
		case "stop":
			nc.handleStop(msg.Payload)
		case "pause":
			nc.handlePause(msg.Payload)
		case "resume":
			nc.handleResume(msg.Payload)
		}
	}
}

func (nc *NodeClient) handleTask(payload json.RawMessage) {
	var task taskPayload
	if err := json.Unmarshal(payload, &task); err != nil {
		log.Printf("[Task] Invalid task payload: %v", err)
		return
	}

	log.Printf("[Task] Received task: %s", task.SessionID)

	// Start Claude Code in PTY
	go nc.executeTask(task)
}

func (nc *NodeClient) executeTask(task taskPayload) {
	claudeCmd := "claude"
	workspace := task.Workspace

	// Platform-specific: on Windows, run claude via WSL
	if nc.Platform == "windows" {
		claudeCmd = "wsl"
		workspace = platform.WSLPath(task.Workspace)
	}

	// Create PTY
	p := platform.NewPTY()

	procCtrl := platform.NewProcessController(p)
	if err := procCtrl.Start(claudeCmd, []string{"-p", task.Prompt}, workspace, p); err != nil {
		nc.sendTaskResult(task.SessionID, false, fmt.Sprintf("failed to start: %v", err))
		return
	}

	sp := &sessionPTY{pty: p, procCtrl: procCtrl}
	nc.sessionPTYs[task.SessionID] = sp

	// Read output and send to backend; keep reading until process exits
	buf := make([]byte, 4096)
	for {
		n, err := p.Read(buf)
		if err != nil {
			break
		}
		nc.sendOutput(task.SessionID, string(buf[:n]))
	}

	// Process exited — send result and clean up
	nc.sendTaskResult(task.SessionID, true, "")
	delete(nc.sessionPTYs, task.SessionID)
}

func (nc *NodeClient) handleInput(payload json.RawMessage) {
	var input struct {
		SessionID string `json:"session_id"`
		Data      string `json:"data"`
	}
	if err := json.Unmarshal(payload, &input); err != nil {
		return
	}

	if sp, ok := nc.sessionPTYs[input.SessionID]; ok {
		sp.pty.Write([]byte(input.Data))
	}
}

func (nc *NodeClient) handleStop(payload json.RawMessage) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	if sp, ok := nc.sessionPTYs[req.SessionID]; ok {
		sp.procCtrl.Stop()
		delete(nc.sessionPTYs, req.SessionID)
	}
}

func (nc *NodeClient) handlePause(payload json.RawMessage) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	if sp, ok := nc.sessionPTYs[req.SessionID]; ok {
		sp.procCtrl.Pause()
	}
}

func (nc *NodeClient) handleResume(payload json.RawMessage) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return
	}

	if sp, ok := nc.sessionPTYs[req.SessionID]; ok {
		sp.procCtrl.Resume()
	}
}

func (nc *NodeClient) sendOutput(sessionID, data string) {
	payload := outputPayload{
		SessionID: sessionID,
		Data:      data,
	}
	nc.send("output", payload)
}

func (nc *NodeClient) sendTaskResult(sessionID string, success bool, errMsg string) {
	payload := taskResultPayload{
		SessionID: sessionID,
		Success:   success,
		Error:     errMsg,
	}
	nc.send("task_result", payload)
}

func (nc *NodeClient) send(msgType string, payload interface{}) {
	data, _ := json.Marshal(wsMessage{
		Type:    msgType,
		Payload: mustJSON(payload),
	})
	select {
	case nc.writeCh <- data:
	default:
		log.Printf("[WS] Write channel full, dropping message")
	}
}

func (nc *NodeClient) Close() {
	close(nc.done)
	if nc.conn != nil {
		nc.conn.Close()
	}
	for _, sp := range nc.sessionPTYs {
		sp.procCtrl.Stop()
	}
}

func mustJSON(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}
