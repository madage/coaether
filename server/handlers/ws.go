package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/superco/server/models"
	"github.com/superco/server/protocol"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type DashboardConn struct {
	Conn *websocket.Conn
	Mu   sync.Mutex
}

// DashboardHub manages dashboard WebSocket connections and broadcasting.
type DashboardHub struct {
	DB         *sql.DB
	JWTSecret  string
	Bus        *protocol.MessageBus
	Dashboards map[string]*DashboardConn
	UserConns  map[string]map[string]bool // userID → set of connIDs
	Mu         sync.RWMutex
}

func NewDashboardHub(db *sql.DB, jwtSecret string, bus *protocol.MessageBus) *DashboardHub {
	return &DashboardHub{
		DB:         db,
		JWTSecret:  jwtSecret,
		Bus:        bus,
		Dashboards: make(map[string]*DashboardConn),
		UserConns:  make(map[string]map[string]bool),
	}
}

// HandleDashboardWS handles WebSocket connections from the UI dashboard
// for real-time node/session list updates.
func (h *DashboardHub) HandleDashboardWS(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing token"})
		return
	}

	// Verify JWT
	parsedToken, err := jwt.Parse(token, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.JWTSecret), nil
	})
	if err != nil || !parsedToken.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	claims, ok := parsedToken.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
		return
	}
	userID, _ := claims["user_id"].(string)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[Dashboard] Upgrade error: %v", err)
		return
	}

	nc := &DashboardConn{Conn: conn}
	connID := uuid.New().String()

	h.Mu.Lock()
	h.Dashboards[connID] = nc
	if h.UserConns[userID] == nil {
		h.UserConns[userID] = make(map[string]bool)
	}
	h.UserConns[userID][connID] = true
	h.Mu.Unlock()

	log.Printf("[Dashboard] Connected: %s (user: %s)", connID, userID)

	// Send initial state
	h.sendDashboardInit(nc, userID)

	// Heartbeat
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

	defer func() {
		h.Mu.Lock()
		delete(h.Dashboards, connID)
		if h.UserConns[userID] != nil {
			delete(h.UserConns[userID], connID)
			if len(h.UserConns[userID]) == 0 {
				delete(h.UserConns, userID)
			}
		}
		h.Mu.Unlock()
		conn.Close()
		log.Printf("[Dashboard] Disconnected: %s", connID)
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (h *DashboardHub) sendDashboardInit(nc *DashboardConn, userID string) {
	// Build set of currently active bus runtime node IDs
	activeBusNodes := make(map[string]bool)
	if h.Bus != nil {
		for _, ep := range h.Bus.EndpointsByType(protocol.EndpointRuntime) {
			nodeID := "bus-" + strings.ReplaceAll(ep.ID, "://", "--")
			activeBusNodes[nodeID] = true
		}
	}

	// Fetch nodes for this user
	nodes := make([]models.Node, 0)
	rows, err := h.DB.Query(
		`SELECT id, user_id, name, os, arch, status, version, ip, last_seen, created_at
		 FROM nodes WHERE user_id = $1 ORDER BY created_at DESC`, userID,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var n models.Node
			if err := rows.Scan(&n.ID, &n.UserID, &n.Name, &n.OS, &n.Arch, &n.Status, &n.Version, &n.IP, &n.LastSeen, &n.CreatedAt); err == nil {
				// Skip bus virtual nodes that have no active runtime connection.
				if strings.HasPrefix(n.ID, "bus-") && !activeBusNodes[n.ID] {
					continue
				}
				nodes = append(nodes, n)
			}
		}
	} else {
		log.Printf("[Dashboard] Failed to query nodes for init: %v", err)
	}

	// Add bus-connected runtime endpoints as virtual nodes for dashboard visibility.
	if h.Bus != nil {
		existing := make(map[string]bool, len(nodes))
		for _, n := range nodes {
			existing[n.ID] = true
		}
		for _, ep := range h.Bus.EndpointsByType(protocol.EndpointRuntime) {
			nodeID := "bus-" + strings.ReplaceAll(ep.ID, "://", "--")
			if existing[nodeID] {
				continue
			}
			getMeta := func(key, def string) string {
				if v, ok := ep.Metadata[key]; ok {
					if s, ok := v.(string); ok {
						return s
					}
				}
				return def
			}
			nodes = append(nodes, models.Node{
				ID:          nodeID,
				Name:        getMeta("name", ep.ID),
				Status:      models.NodeStatusOnline,
				OS:          getMeta("os", "unknown"),
				Arch:        getMeta("arch", ""),
				Version:     getMeta("version", ""),
				IP:          "bus",
				MaxSessions: 3,
				LastSeen:    time.Now(),
				CreatedAt:   time.Now(),
			})
		}
	}

	// Fetch sessions for this user
	sessions := make([]models.SessionResp, 0)
	srows, err := h.DB.Query(
		`SELECT id, agent_id, status, prompt, workspace, node_id, created_at
		 FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, userID,
	)
	if err == nil {
		defer srows.Close()
		for srows.Next() {
			var s models.SessionResp
			if err := srows.Scan(&s.ID, &s.AgentID, &s.Status, &s.Prompt, &s.Workspace, &s.NodeID, &s.CreatedAt); err == nil {
				sessions = append(sessions, s)
			}
		}
	} else {
		log.Printf("[Dashboard] Failed to query sessions for init: %v", err)
	}

	payload := map[string]interface{}{
		"nodes":    nodes,
		"sessions": sessions,
	}
	data, _ := json.Marshal(wsMessage{Type: "init", Payload: mustJSON(payload)})
	nc.Mu.Lock()
	nc.Conn.WriteMessage(websocket.TextMessage, data)
	nc.Mu.Unlock()
}

// BroadcastToDashboards sends a message to all connected dashboard clients.
func (h *DashboardHub) BroadcastToDashboards(msgType string, payload interface{}) {
	data, err := json.Marshal(wsMessage{Type: msgType, Payload: mustJSON(payload)})
	if err != nil {
		return
	}

	h.Mu.RLock()
	defer h.Mu.RUnlock()

	for id, dc := range h.Dashboards {
		dc.Mu.Lock()
		if err := dc.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[Dashboard] Write error (%s): %v", id, err)
		}
		dc.Mu.Unlock()
	}
}

// BroadcastSessionUpdate sends a session status update to all dashboard clients.
func (h *DashboardHub) BroadcastSessionUpdate(sessionID string, status interface{}, prompt, workspace, nodeID string) {
	h.BroadcastToDashboards("session_update", map[string]interface{}{
		"id":        sessionID,
		"status":    status,
		"prompt":    prompt,
		"workspace": workspace,
		"node_id":   nodeID,
	})
}

// SignalChange broadcasts a lightweight "resource changed" signal to all dashboard clients.
// Components use this to know when to refetch data.
func (h *DashboardHub) SignalChange(resource string) {
	h.BroadcastToDashboards("resource_change", map[string]string{
		"resource": resource,
	})
}

// SignalUser sends a "resource changed" signal only to a specific user's dashboard connections.
// If the user has no active connections, the signal is silently dropped.
func (h *DashboardHub) SignalUser(userID string, resource string) {
	data, err := json.Marshal(wsMessage{Type: "resource_change", Payload: mustJSON(map[string]string{
		"resource": resource,
	})})
	if err != nil {
		return
	}

	h.Mu.RLock()
	connIDs := h.UserConns[userID]
	h.Mu.RUnlock()

	for connID := range connIDs {
		h.Mu.RLock()
		dc := h.Dashboards[connID]
		h.Mu.RUnlock()
		if dc == nil {
			continue
		}
		dc.Mu.Lock()
		if err := dc.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[Dashboard] SignalUser write error (%s): %v", connID, err)
		}
		dc.Mu.Unlock()
	}
}

// SendNotification sends a notification message to a specific user's dashboard connections.
// The notification appears as a visible popup/toast in the UI.
func (h *DashboardHub) SendNotification(userID string, notifType string, title, message string) {
	data, err := json.Marshal(wsMessage{Type: "notification", Payload: mustJSON(map[string]string{
		"type":    notifType,
		"title":   title,
		"message": message,
	})})
	if err != nil {
		return
	}

	h.Mu.RLock()
	connIDs := h.UserConns[userID]
	h.Mu.RUnlock()

	for connID := range connIDs {
		h.Mu.RLock()
		dc := h.Dashboards[connID]
		h.Mu.RUnlock()
		if dc == nil {
			continue
		}
		dc.Mu.Lock()
		if err := dc.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[Dashboard] SendNotification write error (%s): %v", connID, err)
		}
		dc.Mu.Unlock()
	}
}

// wsMessage is the wire format for dashboard WebSocket messages.
type wsMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

func mustJSON(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}
