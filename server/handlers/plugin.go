package handlers

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

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
	name := c.Param("name")
	inst := h.Manager.Get(name)
	if inst == nil {
		c.JSON(404, gin.H{"error": "plugin not found"})
		return
	}
	c.JSON(200, gin.H{"plugin": inst})
}

// Start launches a plugin.
func (h *PluginHandler) Start(c *gin.Context) {
	name := c.Param("name")
	if err := h.Manager.Start(c.Request.Context(), name); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "started", "plugin": name})
}

// Stop stops a running plugin.
func (h *PluginHandler) Stop(c *gin.Context) {
	name := c.Param("name")
	if err := h.Manager.Stop(name); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "stopped", "plugin": name})
}

// Remove deletes a plugin from the manager and disk.
func (h *PluginHandler) Remove(c *gin.Context) {
	name := c.Param("name")
	if err := h.Manager.Remove(name); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"status": "removed", "plugin": name})
}

// Reload stops and re-registers a plugin.
func (h *PluginHandler) Reload(c *gin.Context) {
	name := c.Param("name")
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
	name := c.Param("name")
	health := h.Manager.CheckHealth(name)
	c.JSON(http.StatusOK, gin.H{"health": health})
}

// InstallUpload installs a plugin from an uploaded ZIP file.
func (h *PluginHandler) InstallUpload(c *gin.Context) {
	file, _, err := c.Request.FormFile("plugin")
	if err != nil {
		c.JSON(400, gin.H{"error": "missing plugin file"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to read upload"})
		return
	}

	tmpDir, err := os.MkdirTemp("", "plugin-upload-*")
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to create temp dir"})
		return
	}
	defer os.RemoveAll(tmpDir)

	zipReader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid zip file"})
		return
	}

	// Extract with zip-slip protection
	for _, f := range zipReader.File {
		path := filepath.Join(tmpDir, f.Name)
		if !strings.HasPrefix(filepath.Clean(path), filepath.Clean(tmpDir)+string(os.PathSeparator)) {
			c.JSON(400, gin.H{"error": "invalid zip entry path"})
			return
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(path, 0755)
			continue
		}
		os.MkdirAll(filepath.Dir(path), 0755)
		rc, err := f.Open()
		if err != nil {
			c.JSON(500, gin.H{"error": "failed to extract file"})
			return
		}
		out, err := os.Create(path)
		if err != nil {
			rc.Close()
			c.JSON(500, gin.H{"error": "failed to create file"})
			return
		}
		io.Copy(out, rc)
		out.Close()
		rc.Close()
	}

	// Try plugin.json at root, then inside a single subdirectory
	manifestPath := filepath.Join(tmpDir, "plugin.json")
	if _, e := os.Stat(manifestPath); os.IsNotExist(e) {
		entries, dirErr := os.ReadDir(tmpDir)
		if dirErr == nil && len(entries) == 1 && entries[0].IsDir() {
			manifestPath = filepath.Join(tmpDir, entries[0].Name(), "plugin.json")
		}
	}
	if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
		c.JSON(400, gin.H{"error": "plugin.json not found in zip"})
		return
	}

	manifestDir := filepath.Dir(manifestPath)
	if manifestDir != tmpDir {
		// Files were wrapped in a subdirectory -- flatten
		entries, _ := os.ReadDir(manifestDir)
		for _, e := range entries {
			oldPath := filepath.Join(manifestDir, e.Name())
			newPath := filepath.Join(tmpDir, e.Name())
			os.Rename(oldPath, newPath)
		}
		manifestPath = filepath.Join(tmpDir, "plugin.json")
	}

	manifest, err := plugin.LoadManifest(manifestPath)
	if err != nil {
		c.JSON(400, gin.H{"error": fmt.Sprintf("invalid plugin.json: %v", err)})
		return
	}

	if h.Manager.Get(manifest.Name) != nil {
		c.JSON(409, gin.H{"error": fmt.Sprintf("plugin %q already registered", manifest.Name)})
		return
	}

	targetDir := filepath.Join(h.Manager.BaseDir(), "plugins", manifest.PluginDir())
	if err := os.MkdirAll(filepath.Dir(targetDir), 0755); err != nil {
		c.JSON(500, gin.H{"error": "failed to create plugins dir"})
		return
	}
	os.RemoveAll(targetDir)

	if err := os.Rename(tmpDir, targetDir); err != nil {
		// Cross-device fallback
		if err := copyDir(tmpDir, targetDir); err != nil {
			c.JSON(500, gin.H{"error": "failed to move plugin"})
			return
		}
	}

	h.Manager.Register(*manifest)

	// Build binary so it's ready to start
	warn := ""
	if err := h.Manager.BuildBinary(manifest.Name); err != nil {
		warn = fmt.Sprintf("plugin registered but build failed: %v", err)
	}

	c.JSON(200, gin.H{"status": "installed", "plugin": manifest.Name, "version": manifest.Version, "warning": warn})
}

// InstallGit installs a plugin by cloning a git repository.
func (h *PluginHandler) InstallGit(c *gin.Context) {
	var req struct {
		URL    string `json:"url"`
		Branch string `json:"branch,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request body"})
		return
	}
	if req.URL == "" {
		c.JSON(400, gin.H{"error": "git URL is required"})
		return
	}

	tmpDir, err := os.MkdirTemp("", "plugin-git-*")
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to create temp dir"})
		return
	}
	defer os.RemoveAll(tmpDir)

	args := []string{"clone", "--depth=1"}
	if req.Branch != "" {
		args = append(args, "--branch", req.Branch)
	}
	args = append(args, req.URL, tmpDir)

	cmd := exec.Command("git", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		c.JSON(400, gin.H{"error": fmt.Sprintf("git clone failed: %v\n%s", err, string(output))})
		return
	}

	manifestPath := filepath.Join(tmpDir, "plugin.json")
	if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
		c.JSON(400, gin.H{"error": "plugin.json not found in repository"})
		return
	}

	manifest, err := plugin.LoadManifest(manifestPath)
	if err != nil {
		c.JSON(400, gin.H{"error": fmt.Sprintf("invalid plugin.json: %v", err)})
		return
	}

	if h.Manager.Get(manifest.Name) != nil {
		c.JSON(409, gin.H{"error": fmt.Sprintf("plugin %q already registered", manifest.Name)})
		return
	}

	targetDir := filepath.Join(h.Manager.BaseDir(), "plugins", manifest.PluginDir())
	if err := os.MkdirAll(filepath.Dir(targetDir), 0755); err != nil {
		c.JSON(500, gin.H{"error": "failed to create plugins dir"})
		return
	}
	os.RemoveAll(targetDir)

	if err := os.Rename(tmpDir, targetDir); err != nil {
		if err := copyDir(tmpDir, targetDir); err != nil {
			c.JSON(500, gin.H{"error": "failed to move plugin"})
			return
		}
	}

	h.Manager.Register(*manifest)

	// Build binary so it's ready to start
	warn := ""
	if err := h.Manager.BuildBinary(manifest.Name); err != nil {
		warn = fmt.Sprintf("plugin registered but build failed: %v", err)
	}

	c.JSON(200, gin.H{"status": "installed", "plugin": manifest.Name, "version": manifest.Version, "warning": warn})
}

// copyDir recursively copies a directory.
func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, info.Mode())
	})
}
