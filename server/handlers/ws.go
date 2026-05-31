package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/superco/server/models"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true // allow all origins in MVP
	},
}

type WSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type NodeConnection struct {
	Conn   *websocket.Conn
	NodeID string
	OS     string
	Mu     sync.Mutex
}

type WSHub struct {
	DB          *sql.DB
	Nodes       map[string]*NodeConnection
	NodesBySess map[string]string // session_id -> node_id
	Sessions    map[string]*NodeConnection // session_id -> ui conn
	Mu          sync.RWMutex
}

func NewWSHub(db *sql.DB) *WSHub {
	return &WSHub{
		DB:          db,
		Nodes:       make(map[string]*NodeConnection),
		NodesBySess: make(map[string]string),
		Sessions:    make(map[string]*NodeConnection),
	}
}

func (h *WSHub) HandleNodeWS(c *gin.Context) {
	nodeID := c.Query("node_id")
	if nodeID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing node_id"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}

	nc := &NodeConnection{Conn: conn, NodeID: nodeID}
	h.Mu.Lock()
	h.Nodes[nodeID] = nc
	h.Mu.Unlock()

	log.Printf("[WS] Node connected: %s", nodeID)

	defer func() {
		h.Mu.Lock()
		delete(h.Nodes, nodeID)
		h.Mu.Unlock()
		conn.Close()
		log.Printf("[WS] Node disconnected: %s", nodeID)
	}()

	// heartbeat ping
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	go func() {
		for range ticker.C {
			nc.Mu.Lock()
			if err := nc.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				nc.Mu.Unlock()
				return
			}
			nc.Mu.Unlock()
		}
	}()

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			continue
		}

		h.handleNodeMessage(nc, msg)
	}
}

func (h *WSHub) HandleUIWS(c *gin.Context) {
	sessionID := c.Query("session_id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing session_id"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[WS] UI upgrade error: %v", err)
		return
	}

	h.Mu.Lock()
	h.Sessions[sessionID] = &NodeConnection{Conn: conn}
	h.Mu.Unlock()

	log.Printf("[WS] UI connected to session: %s", sessionID)

	defer func() {
		h.Mu.Lock()
		delete(h.Sessions, sessionID)
		h.Mu.Unlock()
		conn.Close()
	}()
	defer h.cleanupSessionBinding(sessionID)

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			continue
		}

		if msg.Type == "input" {
			h.forwardToNode(sessionID, msgBytes)
		}
	}
}

func (h *WSHub) handleNodeMessage(nc *NodeConnection, msg WSMessage) {
	switch msg.Type {
	case "output":
		var payload struct {
			SessionID string `json:"session_id"`
			Data      string `json:"data"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return
		}
		h.forwardToUI(payload.SessionID, msgBytesReconstruct(msg.Type, msg.Payload))

	case "task_result":
		var payload struct {
			SessionID string `json:"session_id"`
			Success   bool   `json:"success"`
			Error     string `json:"error,omitempty"`
		}
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return
		}
		status := models.SessionCompleted
		if !payload.Success {
			status = models.SessionFailed
		}
		h.DB.Exec("UPDATE sessions SET status = $1, updated_at = NOW(), completed_at = NOW() WHERE id = $2",
			status, payload.SessionID)
		h.forwardToUI(payload.SessionID, msgBytesReconstruct(msg.Type, msg.Payload))
		h.cleanupSessionBinding(payload.SessionID)

	case "claim_task":
		h.assignTask(nc)
	}
}

func (h *WSHub) assignTask(nc *NodeConnection) {
	// In MVP: pop from Redis queue and assign
	// The task assignment is done via Redis BRPop from the node side,
	// but for simplicity we can also push via WebSocket
}

func (h *WSHub) forwardToNode(sessionID string, msg []byte) {
	h.Mu.RLock()
	nodeID, ok := h.NodesBySess[sessionID]
	h.Mu.RUnlock()
	if !ok {
		return
	}

	h.Mu.RLock()
	nc, ok := h.Nodes[nodeID]
	h.Mu.RUnlock()
	if !ok {
		return
	}

	nc.Mu.Lock()
	nc.Conn.WriteMessage(websocket.TextMessage, msg)
	nc.Mu.Unlock()
}

func (h *WSHub) forwardToUI(sessionID string, msg []byte) {
	h.Mu.RLock()
	uic, ok := h.Sessions[sessionID]
	h.Mu.RUnlock()
	if !ok {
		return
	}

	uic.Mu.Lock()
	uic.Conn.WriteMessage(websocket.TextMessage, msg)
	uic.Mu.Unlock()
}

func (h *WSHub) cleanupSessionBinding(sessionID string) {
	h.Mu.Lock()
	delete(h.NodesBySess, sessionID)
	delete(h.Sessions, sessionID)
	h.Mu.Unlock()
}

func msgBytesReconstruct(msgType string, payload json.RawMessage) []byte {
	msg := WSMessage{Type: msgType, Payload: payload}
	b, _ := json.Marshal(msg)
	return b
}
