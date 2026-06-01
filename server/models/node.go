package models

import "time"

type NodeStatus string

const (
	NodeStatusOnline  NodeStatus = "online"
	NodeStatusOffline NodeStatus = "offline"
	NodeStatusBusy    NodeStatus = "busy"
)

type Node struct {
	ID          string     `json:"id"`
	UserID      string     `json:"user_id"`
	Name        string     `json:"name"`
	OS          string     `json:"os"`
	Arch        string     `json:"arch"`
	Status      NodeStatus `json:"status"`
	Version     string     `json:"version"`
	IP          string     `json:"ip"`
	MaxSessions int        `json:"max_sessions"`
	LastSeen    time.Time  `json:"last_seen"`
	CreatedAt   time.Time  `json:"created_at"`
	Agents      []Agent    `json:"agents,omitempty"`
}

type NodeRegisterReq struct {
	NodeToken string `json:"node_token" binding:"required"`
	Name      string `json:"name"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	Version   string `json:"version"`
}

type NodeRegisterResp struct {
	NodeID string `json:"node_id"`
}

type NodeHeartbeatReq struct {
	NodeID string `json:"node_id" binding:"required"`
	Status string `json:"status"`
}
