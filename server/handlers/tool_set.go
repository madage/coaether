package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/coaether/server/harness"
	"github.com/gin-gonic/gin"
)

// ToolSetHandler manages system tool (harness tool) settings.
type ToolSetHandler struct {
	DB           *sql.DB
	Hub          *DashboardHub
	PolicyEngine *harness.PolicyEngine
}

// NewToolSetHandler creates a new ToolSetHandler.
func NewToolSetHandler(db *sql.DB) *ToolSetHandler {
	return &ToolSetHandler{DB: db}
}

// SystemToolResponse represents a harness tool with its global settings and linked agents.
type SystemToolResponse struct {
	Name             string   `json:"name"`
	Description      string   `json:"description"`
	Version          string   `json:"version"`
	RequiredPerm     string   `json:"required_perm"`
	Enabled          bool     `json:"enabled"`
	Status           string   `json:"status"`
	LinkedAgentNames []string `json:"linked_agent_names"`
	LinkedAgentCount int      `json:"linked_agent_count"`
}

// List returns all harness tools with their global settings and linked agents.
func (h *ToolSetHandler) List(c *gin.Context) {
	allTools := harness.AllTools()

	// Load global settings
	settings := make(map[string]struct {
		enabled bool
		status  string
	})
	rows, err := h.DB.Query(`SELECT tool_name, enabled, status FROM system_tool_settings`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var name string
			var enabled bool
			var status string
			if err := rows.Scan(&name, &enabled, &status); err == nil {
				settings[name] = struct {
					enabled bool
					status  string
				}{enabled, status}
			}
		}
	}

	// Load agents per tool: query all enabled agent profiles, parse capabilities
	rows2, err := h.DB.Query(`SELECT name, COALESCE(capabilities::text,'[]') FROM agent_profiles WHERE enabled = true`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query agents"})
		return
	}
	defer rows2.Close()

	// tool -> list of agent names
	toolAgents := make(map[string][]string)
	for rows2.Next() {
		var agentName, capsJSON string
		if err := rows2.Scan(&agentName, &capsJSON); err != nil {
			continue
		}
		// Parse capabilities (flat array or {"tools":[...]} format)
		var caps []string
		if err := json.Unmarshal([]byte(capsJSON), &caps); err != nil {
			var capsObj struct {
				Tools []string `json:"tools"`
			}
			if err2 := json.Unmarshal([]byte(capsJSON), &capsObj); err2 == nil {
				caps = capsObj.Tools
			}
		}
		for _, cap := range caps {
			cap = strings.TrimSpace(cap)
			if cap != "" {
				toolAgents[cap] = append(toolAgents[cap], agentName)
			}
		}
	}

	result := make([]SystemToolResponse, 0, len(allTools))
	for toolName, def := range allTools {
		enabled := true
		status := "active"
		if s, ok := settings[toolName]; ok {
			enabled = s.enabled
			status = s.status
		}
		agents := toolAgents[toolName]
		if agents == nil {
			agents = []string{}
		}
		result = append(result, SystemToolResponse{
			Name:             toolName,
			Description:      def.Description,
			Version:          def.Version,
			RequiredPerm:     def.RequiredPerm,
			Enabled:          enabled,
			Status:           status,
			LinkedAgentNames: agents,
			LinkedAgentCount: len(agents),
		})
	}

	c.JSON(http.StatusOK, gin.H{"tools": result})
}

// Toggle updates the global enabled state for a tool.
func (h *ToolSetHandler) Toggle(c *gin.Context) {
	toolName := c.Param("toolName")

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify tool exists
	if _, exists := harness.AllTools()[toolName]; !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "tool not found"})
		return
	}

	_, err := h.DB.Exec(
		`INSERT INTO system_tool_settings (tool_name, enabled, status, updated_at)
		 VALUES ($1, $2, CASE WHEN $2 THEN 'active' ELSE 'disabled' END, NOW())
		 ON CONFLICT (tool_name) DO UPDATE SET enabled = $2, status = CASE WHEN $2 THEN 'active' ELSE 'disabled' END, updated_at = NOW()`,
		toolName, req.Enabled,
	)
	if err != nil {
		log.Printf("[ToolSet] Toggle error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update tool setting"})
		return
	}

	// Refresh policy engine cache if set
	if h.PolicyEngine != nil {
		h.PolicyEngine.RefreshToolSettings()
	}

	if h.Hub != nil {
		h.Hub.SignalChange("tools")
	}

	log.Printf("[ToolSet] Tool '%s' enabled=%v", toolName, req.Enabled)
	c.JSON(http.StatusOK, gin.H{"status": "updated", "tool": toolName, "enabled": req.Enabled})
}
