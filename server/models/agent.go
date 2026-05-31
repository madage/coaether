package models

import "time"

type Agent struct {
	ID           string    `json:"id"`
	NodeID       string    `json:"node_id"`
	Name         string    `json:"name"`
	Command      string    `json:"command"`
	Version      string    `json:"version"`
	Enabled      bool      `json:"enabled"`
	AutoDetected bool      `json:"auto_detected"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type AgentScanResult struct {
	Name         string `json:"name"`
	Command      string `json:"command"`
	Version      string `json:"version"`
	AutoDetected bool   `json:"auto_detected"`
}
