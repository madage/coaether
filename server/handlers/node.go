package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/superco/server/models"
	"github.com/superco/server/redis"
)

type NodeHandler struct {
	DB *sql.DB
}

func NewNodeHandler(db *sql.DB) *NodeHandler {
	return &NodeHandler{DB: db}
}

func (h *NodeHandler) Register(c *gin.Context) {
	var req models.NodeRegisterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	nodeID := uuid.New().String()
	node := models.Node{
		ID:        nodeID,
		UserID:    userID.(string),
		Name:      req.Name,
		OS:        req.OS,
		Arch:      req.Arch,
		Status:    models.NodeStatusOnline,
		Version:   req.Version,
		IP:        c.ClientIP(),
		LastSeen:  time.Now(),
		CreatedAt: time.Now(),
	}

	_, err := h.DB.Exec(
		`INSERT INTO nodes (id, user_id, name, os, arch, status, version, ip, last_seen, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		node.ID, node.UserID, node.Name, node.OS, node.Arch, node.Status, node.Version, node.IP, node.LastSeen, node.CreatedAt,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register node"})
		return
	}

	wsToken := uuid.New().String()
	if err := redis.SetNodeOnline(nodeID, wsToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to set node online"})
		return
	}

	c.JSON(http.StatusOK, models.NodeRegisterResp{
		NodeID:  nodeID,
		WSToken: wsToken,
	})
}

func (h *NodeHandler) List(c *gin.Context) {
	userID, _ := c.Get("user_id")

	rows, err := h.DB.Query(
		`SELECT id, user_id, name, os, arch, status, version, ip, last_seen, created_at
		 FROM nodes WHERE user_id = $1 ORDER BY last_seen DESC`, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query nodes"})
		return
	}
	defer rows.Close()

	var nodes []models.Node
	for rows.Next() {
		var n models.Node
		if err := rows.Scan(&n.ID, &n.UserID, &n.Name, &n.OS, &n.Arch, &n.Status, &n.Version, &n.IP, &n.LastSeen, &n.CreatedAt); err != nil {
			continue
		}
		nodes = append(nodes, n)
	}

	if nodes == nil {
		nodes = []models.Node{}
	}

	c.JSON(http.StatusOK, gin.H{"nodes": nodes})
}

func (h *NodeHandler) Heartbeat(c *gin.Context) {
	var req models.NodeHeartbeatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := h.DB.Exec(
		"UPDATE nodes SET status = $1, last_seen = NOW() WHERE id = $2",
		req.Status, req.NodeID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update heartbeat"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *NodeHandler) GetByID(c *gin.Context) {
	nodeID := c.Param("id")

	var n models.Node
	err := h.DB.QueryRow(
		`SELECT id, user_id, name, os, arch, status, version, ip, last_seen, created_at
		 FROM nodes WHERE id = $1`, nodeID,
	).Scan(&n.ID, &n.UserID, &n.Name, &n.OS, &n.Arch, &n.Status, &n.Version, &n.IP, &n.LastSeen, &n.CreatedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	c.JSON(http.StatusOK, n)
}
