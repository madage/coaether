package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/coaether/server/plugin"
)

// PluginHandler serves the plugin management API.
type PluginHandler struct {
	Manager *plugin.Manager
}

// NewPluginHandler creates a new PluginHandler.
func NewPluginHandler(mgr *plugin.Manager) *PluginHandler {
	return &PluginHandler{Manager: mgr}
}

// List returns all registered plugins with their state.
func (h *PluginHandler) List(c *gin.Context) {
	plugins := h.Manager.List()
	type pluginView struct {
		Name         string            `json:"name"`
		Version      string            `json:"version"`
		Type         plugin.PluginType `json:"type"`
		State        plugin.PluginState `json:"state"`
		Label        map[string]string `json:"label,omitempty"`
		Description  map[string]string `json:"description,omitempty"`
		Author       string            `json:"author,omitempty"`
		Pid          int               `json:"pid,omitempty"`
		Port         int               `json:"port,omitempty"`
		Error        string            `json:"error,omitempty"`
		Permissions  []string          `json:"permissions,omitempty"`
		Hooks        []string          `json:"hooks,omitempty"`
		APIRoutes    []string          `json:"api_routes,omitempty"`
		FrontendSlots map[string]string `json:"frontend_slots,omitempty"`
		Uptime       int64             `json:"uptime_seconds,omitempty"`
	}

	views := make([]pluginView, 0, len(plugins))
	for _, p := range plugins {
		v := pluginView{
			Name:        p.Manifest.Name,
			Version:     p.Manifest.Version,
			Type:        p.Manifest.Type,
			State:       p.State,
			Label:       p.Manifest.Label,
			Description: p.Manifest.Description,
			Author:      p.Manifest.Author,
			Pid:         p.Pid,
			Port:        p.Port,
			Error:       p.Error,
			Permissions: p.Manifest.Permissions,
			Hooks:       p.Manifest.Capabilities.Hooks,
			APIRoutes:   p.Manifest.Capabilities.APIRoutes,
			FrontendSlots: p.Manifest.Frontend.Slots,
		}
		if !p.StartedAt.IsZero() {
			v.Uptime = int64(p.StartedAt.Sub(p.StartedAt).Seconds())
		}
		views = append(views, v)
	}

	c.JSON(200, gin.H{"plugins": views})
}

// Get returns details for a single plugin.
func (h *PluginHandler) Get(c *gin.Context) {
	name := c.Param("id")
	inst := h.Manager.Get(name)
	if inst == nil {
		c.JSON(404, gin.H{"error": "plugin not found"})
		return
	}
	c.JSON(200, gin.H{"plugin": inst})
}

// Start launches a plugin.
func (h *PluginHandler) Start(c *gin.Context) {
	name := c.Param("id")
	if err := h.Manager.Start(c.Request.Context(), name); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "started", "plugin": name})
}

// Stop stops a running plugin.
func (h *PluginHandler) Stop(c *gin.Context) {
	name := c.Param("id")
	if err := h.Manager.Stop(name); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "stopped", "plugin": name})
}

// Reload stops and re-registers a plugin.
func (h *PluginHandler) Reload(c *gin.Context) {
	name := c.Param("id")
	inst := h.Manager.Get(name)
	if inst == nil {
		c.JSON(404, gin.H{"error": "plugin not found"})
		return
	}

	// Stop if running
	if inst.State == plugin.StateRunning {
		if err := h.Manager.Stop(name); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	}

	// Re-register from manifest
	manifests, err := h.Manager.ScanPlugins()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	var found *plugin.Manifest
	for _, m := range manifests {
		if m.Name == name {
			found = &m
			break
		}
	}
	if found == nil {
		c.JSON(404, gin.H{"error": "plugin manifest not found on disk"})
		return
	}

	// Register and start
	h.Manager.Register(*found)
	if err := h.Manager.Start(c.Request.Context(), name); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"status": "reloaded", "plugin": name})
}

// HealthCheck runs a health check on a plugin.
func (h *PluginHandler) HealthCheck(c *gin.Context) {
	name := c.Param("id")
	health := h.Manager.CheckHealth(name)
	c.JSON(http.StatusOK, gin.H{"health": health})
}
