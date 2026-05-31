package main

import (
	"encoding/json"
	"log"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/superco/agent-runtime/backends"
	"github.com/superco/server/protocol"
)

// Runtime connects to the Message Bus and manages agent backends.
type Runtime struct {
	ServerURL string
	NodeID    string
	Name      string

	conn      *websocket.Conn
	connMu    sync.Mutex
	backends  map[string]Backend
	endpoint  string
}

// NewRuntime creates a new Runtime.
func NewRuntime(serverURL, nodeID, name string) *Runtime {
	return &Runtime{
		ServerURL: serverURL,
		NodeID:    nodeID,
		Name:      name,
		backends:  make(map[string]Backend),
		endpoint:  "runtime://" + nodeID,
	}
}

// RegisterBackend adds a backend handler for a specific agent ID.
func (r *Runtime) RegisterBackend(agentID string, backend Backend) {
	r.backends[agentID] = backend
	log.Printf("[Runtime] Registered backend: %s (%s)", agentID, backend.Name())
}

// Run connects to the Message Bus and starts the message loop.
func (r *Runtime) Run() error {
	u := url.URL{
		Scheme: "ws",
		Host:   r.ServerURL,
		Path:   "/ws/bus",
		RawQuery: url.Values{
			"type":    {"runtime"},
			"node_id": {r.NodeID},
		}.Encode(),
	}

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return err
	}
	r.conn = conn
	log.Printf("[Runtime] Connected to bus as %s", r.endpoint)

	r.sendHello()

	done := make(chan struct{})
	defer close(done)
	go func() {
		pingTicker := time.NewTicker(30 * time.Second)
		cleanTicker := time.NewTicker(60 * time.Second)
		defer pingTicker.Stop()
		defer cleanTicker.Stop()
		for {
			select {
			case <-pingTicker.C:
				r.sendPing()
			case <-cleanTicker.C:
				r.cleanIdleSessions()
			case <-done:
				return
			}
		}
	}()

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		var env protocol.Envelope
		if err := json.Unmarshal(msgBytes, &env); err != nil {
			log.Printf("[Runtime] Invalid message: %v", err)
			continue
		}
		r.handleMessage(&env)
	}
}

func (r *Runtime) sendHello() {
	caps := make([]protocol.Capability, 0, len(r.backends))
	for id, b := range r.backends {
		caps = append(caps, protocol.Capability{
			ID:      id,
			Name:    b.Name(),
			Version: b.Version(),
			Backend: "api",
		})
	}

	r.send(protocol.NewEnvelope(r.endpoint, "system://bus", protocol.MsgHello,
		&protocol.Payload{Capabilities: caps, EndpointType: "runtime",
			Metadata: map[string]any{
				"name":    r.Name,
				"version": "0.1.0",
			},
		}))
}

func (r *Runtime) sendPing() {
	r.send(protocol.NewEnvelope(r.endpoint, "system://bus", protocol.MsgPing, nil))
}

func (r *Runtime) handleMessage(env *protocol.Envelope) {
	switch env.Type {
	case protocol.MsgPong:
		// heartbeat ok

	case protocol.MsgSessionCreate:
		log.Printf("[Runtime] Session create received: %s", env.SessionID)
		join := protocol.NewEnvelope(r.endpoint, "system://bus", protocol.MsgSessionJoin, nil)
		join.SessionID = env.SessionID
		r.send(join)

	case protocol.MsgSessionJoined:
		log.Printf("[Runtime] Joined session: %s", env.SessionID)

	case protocol.MsgSessionEnd:
		log.Printf("[Runtime] Session end: %s", env.SessionID)
		if cli, ok := r.backends["claude"].(*backends.ClaudeCLIBackend); ok {
			cli.CloseSession(env.SessionID)
		}

	case protocol.MsgMessage:
		log.Printf("[Runtime] Message received for session %s from %s", env.SessionID, env.From)
		r.handleAgentMessage(env)

	case protocol.MsgEvent, protocol.MsgToolUse, protocol.MsgToolResult:
		// Session-scoped events consumed by UI clients

	case protocol.MsgPermissionResponse:
		log.Printf("[Runtime] Permission response for session %s", env.SessionID)
		if cli, ok := r.backends["claude"].(*backends.ClaudeCLIBackend); ok {
			cli.HandlePermissionResponse(env)
		}

	default:
		log.Printf("[Runtime] Unhandled type: %s", env.Type)
	}
}

func (r *Runtime) handleAgentMessage(env *protocol.Envelope) {
	if env.Payload == nil {
		return
	}

	// Route to the first matching backend
	for _, backend := range r.backends {
		resp, err := backend.HandleMessage(env)
		if err != nil {
			log.Printf("[Runtime] Backend error: %v", err)
			r.send(protocol.NewEnvelope(
				r.endpoint, env.From, protocol.MsgError,
				&protocol.Payload{Code: "BACKEND_ERROR", Message: err.Error()},
			).WithSession(env.SessionID).WithReplyTo(env.ID))
		}
		if resp != nil {
			resp.From = r.endpoint
			resp.To = env.From
			resp.SessionID = env.SessionID
			resp.ReplyTo = env.ID
			r.send(resp)
		}
		break
	}
}

func (r *Runtime) send(env *protocol.Envelope) {
	r.connMu.Lock()
	defer r.connMu.Unlock()
	if err := r.conn.WriteJSON(env); err != nil {
		log.Printf("[Runtime] Write error: %v", err)
	}
}

func (r *Runtime) cleanIdleSessions() {
	if cli, ok := r.backends["claude"].(*backends.ClaudeCLIBackend); ok {
		cli.CleanIdleSessions()
	}
}

// Backend handles messages for a specific AI agent.
type Backend interface {
	Name() string
	Version() string
	HandleMessage(env *protocol.Envelope) (*protocol.Envelope, error)
}

func main() {
	serverURL := os.Getenv("SERVER_URL")
	if serverURL == "" {
		serverURL = "localhost:8088"
	}

	nodeID := os.Getenv("NODE_ID")
	if nodeID == "" {
		nodeID = "runtime-" + os.Getenv("HOSTNAME")
		if nodeID == "runtime-" {
			nodeID = "runtime-default"
		}
	}

	name := os.Getenv("RUNTIME_NAME")
	if name == "" {
		name, _ = os.Hostname()
	}

	log.Printf("[Runtime] Starting on node %s, connecting to %s", nodeID, serverURL)

	rt := NewRuntime(serverURL, nodeID, name)

	// Register backends
	// 1. Try Claude CLI (stream-json) — persistent, full tool support
	if cli := backends.NewClaudeCLIBackend(""); cli != nil {
		cli.SetSendFunc(rt.send)
		rt.RegisterBackend("claude", cli)
		log.Println("[Runtime] Claude CLI backend enabled (stream-json)")
	} else if api := backends.NewClaudeBackend(); api != nil {
		// 2. Fallback to Claude API (direct Anthropic API call)
		rt.RegisterBackend("claude", api)
		log.Println("[Runtime] Claude API backend enabled")
	} else {
		// 3. Fallback: echo backend for testing
		rt.RegisterBackend("echo", backends.NewEchoBackend())
		log.Println("[Runtime] No claude CLI or API key, using echo backend")
	}

	go func() {
		for {
			err := rt.Run()
			if err != nil {
				log.Printf("[Runtime] Connection error: %v (retry in 3s)", err)
				time.Sleep(3 * time.Second)
			} else {
				return
			}
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Println("[Runtime] Shutdown")
}
