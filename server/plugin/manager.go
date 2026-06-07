package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

const (
	handshakePortEnv = "COAETHER_PLUGIN_PORT"
	pluginDir        = "plugins"
)

// Manager handles plugin discovery, lifecycle, and routing.
type Manager struct {
	mu        sync.RWMutex
	plugins   map[string]*PluginInstance
	baseDir   string // root directory containing plugins/
	dataDir   string // root data directory
	logger    *log.Logger
	hostAddr  string // address of the host server (injected into plugins)
}

// NewManager creates a new plugin manager.
func NewManager(baseDir, dataDir string) *Manager {
	return &Manager{
		plugins:  make(map[string]*PluginInstance),
		baseDir:  baseDir,
		dataDir:  dataDir,
		logger:   log.New(log.Writer(), "[PluginManager] ", log.LstdFlags|log.Lmsgprefix),
	}
}

// SetHostAddr sets the host address for plugin callback URLs.
func (m *Manager) SetHostAddr(addr string) { m.hostAddr = addr }

// ==================== Discovery ====================

// ScanPlugins walks the plugins directory and discovers all plugin manifests.
func (m *Manager) ScanPlugins() ([]Manifest, error) {
	pluginsDir := filepath.Join(m.baseDir, pluginDir)
	entries, err := os.ReadDir(pluginsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // no plugins directory yet
		}
		return nil, fmt.Errorf("scan plugins dir: %w", err)
	}

	var manifests []Manifest
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		manifestPath := filepath.Join(pluginsDir, entry.Name(), "plugin.json")
		if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
			continue
		}
		manifest, err := LoadManifest(manifestPath)
		if err != nil {
			m.logger.Printf("[WARN] Plugin %s: invalid manifest: %v", entry.Name(), err)
			continue
		}
		manifests = append(manifests, *manifest)
	}
	return manifests, nil
}

// LoadAndRegister scans the plugins directory, validates manifests, and registers each.
func (m *Manager) LoadAndRegister() ([]string, error) {
	manifests, err := m.ScanPlugins()
	if err != nil {
		return nil, err
	}

	var loaded []string
	for _, manifest := range manifests {
		if err := m.Register(manifest); err != nil {
			m.logger.Printf("[WARN] Failed to register plugin %s: %v", manifest.Name, err)
			continue
		}
		loaded = append(loaded, manifest.Name)
	}
	return loaded, nil
}

// Register adds a plugin manifest to the manager without starting it.
func (m *Manager) Register(manifest Manifest) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.plugins[manifest.Name]; exists {
		return fmt.Errorf("plugin %q already registered", manifest.Name)
	}

	pluginDataDir := filepath.Join(m.dataDir, "plugins", manifest.Name)

	inst := &PluginInstance{
		Manifest: manifest,
		State:    StateDiscovered,
		DataDir:  pluginDataDir,
	}
	m.plugins[manifest.Name] = inst
	m.logger.Printf("[INFO] Registered plugin: %s@%s (type=%s)", manifest.Name, manifest.Version, manifest.Type)
	return nil
}

// ==================== Lifecycle ====================

// Start launches a plugin binary and waits for it to become ready.
func (m *Manager) Start(ctx context.Context, name string) error {
	m.mu.Lock()
	inst, ok := m.plugins[name]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("plugin %q not registered", name)
	}
	if inst.State != StateDiscovered && inst.State != StateStopped && inst.State != StateError {
		m.mu.Unlock()
		return fmt.Errorf("plugin %q is in state %s, cannot start", name, inst.State)
	}
	inst.State = StateStarting
	inst.Error = ""
	m.mu.Unlock()

	// Find the plugin binary
	binaryPath := m.findBinary(name)
	if binaryPath == "" {
		m.setState(name, StateError, "binary not found")
		return fmt.Errorf("plugin %q binary not found", name)
	}

	// Ensure data directory exists
	if err := os.MkdirAll(inst.DataDir, 0755); err != nil {
		m.setState(name, StateError, fmt.Sprintf("data dir: %v", err))
		return err
	}

	// Start the plugin process (use Command, not CommandContext, so the process
	// outlives the HTTP request that triggered it). The ctx is only used for
	// handshake/init timeout via the select below.
	cmd := exec.Command(binaryPath)
	cmd.Dir = filepath.Dir(binaryPath)
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("%s=%d", handshakePortEnv, inst.Manifest.Capabilities.HTTPPort),
		"COAETHER_PLUGIN_ID="+name,
		"COAETHER_HOST_ADDR="+m.hostAddr,
		"COAETHER_DATA_DIR="+inst.DataDir,
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		m.setState(name, StateError, fmt.Sprintf("stdout pipe: %v", err))
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		m.setState(name, StateError, fmt.Sprintf("stderr pipe: %v", err))
		return err
	}

	if err := cmd.Start(); err != nil {
		m.setState(name, StateError, fmt.Sprintf("start: %v", err))
		return err
	}

	inst.Pid = cmd.Process.Pid

	// Read handshake from stdout (plugin writes {"port": PORT} on first line)
	portCh := make(chan int, 1)
	errCh := make(chan error, 1)

	go func() {
		dec := json.NewDecoder(stdout)
		var handshake struct {
			Port int `json:"port"`
		}
		if err := dec.Decode(&handshake); err != nil {
			errCh <- fmt.Errorf("handshake decode: %w", err)
			return
		}
		if handshake.Port == 0 {
			errCh <- fmt.Errorf("handshake missing port")
			return
		}
		portCh <- handshake.Port
	}()

	go func() {
		io.Copy(log.Writer(), stderr) // forward stderr to host log
	}()

	// Wait for handshake or timeout
	select {
	case port := <-portCh:
		inst.Port = port
		inst.StartedAt = time.Now()

		// Call init endpoint
		if err := m.callInit(ctx, inst); err != nil {
			cmd.Process.Kill()
			m.setState(name, StateError, fmt.Sprintf("init: %v", err))
			return err
		}

		inst.State = StateRunning
		m.logger.Printf("[INFO] Plugin started: %s (pid=%d, port=%d)", name, inst.Pid, inst.Port)

		// Monitor process exit
		go func() {
			if err := cmd.Wait(); err != nil {
				m.logger.Printf("[WARN] Plugin %s exited: %v", name, err)
				m.setState(name, StateStopped, err.Error())
			} else {
				m.setState(name, StateStopped, "")
			}
		}()

		return nil

	case err := <-errCh:
		cmd.Process.Kill()
		m.setState(name, StateError, err.Error())
		return err

	case <-ctx.Done():
		cmd.Process.Kill()
		m.setState(name, StateError, "startup timeout")
		return ctx.Err()

	case <-time.After(30 * time.Second):
		cmd.Process.Kill()
		m.setState(name, StateError, "handshake timeout (30s)")
		return fmt.Errorf("plugin %q handshake timeout", name)
	}
}

// Stop sends a shutdown signal to a running plugin.
func (m *Manager) Stop(name string) error {
	m.mu.Lock()
	inst, ok := m.plugins[name]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("plugin %q not registered", name)
	}
	if inst.State != StateRunning {
		m.mu.Unlock()
		return nil
	}
	inst.State = StateStopping
	m.mu.Unlock()

	// Send shutdown request to plugin's HTTP server
	url := fmt.Sprintf("http://127.0.0.1:%d/__plugin/shutdown", inst.Port)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "POST", url, nil)
	req.Body = io.NopCloser(bytes.NewReader([]byte(`{"reason":"manager_stop"}`)))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		m.logger.Printf("[WARN] Plugin %s shutdown request failed: %v", name, err)
	}

	if resp != nil {
		resp.Body.Close()
	}

	// Wait briefly then mark stopped
	time.Sleep(500 * time.Millisecond)
	m.setState(name, StateStopped, "")
	m.logger.Printf("[INFO] Plugin stopped: %s", name)
	return nil
}

// StartAll starts all registered plugins that are in Discovered state.
func (m *Manager) StartAll(ctx context.Context) []string {
	m.mu.RLock()
	var names []string
	for name, inst := range m.plugins {
		if inst.State == StateDiscovered {
			names = append(names, name)
		}
	}
	m.mu.RUnlock()

	var started []string
	for _, name := range names {
		if err := m.Start(ctx, name); err != nil {
			m.logger.Printf("[ERROR] Start plugin %s: %v", name, err)
			continue
		}
		started = append(started, name)
	}
	return started
}

// ShutdownAll gracefully stops all running plugins.
func (m *Manager) ShutdownAll() {
	m.mu.RLock()
	var names []string
	for name, inst := range m.plugins {
		if inst.State == StateRunning {
			names = append(names, name)
		}
	}
	m.mu.RUnlock()

	for _, name := range names {
		m.Stop(name)
	}
}

// BuildBinary attempts to build a plugin's binary from source.
// Returns nil if a binary already exists or the build succeeds.
func (m *Manager) BuildBinary(name string) error {
	m.mu.RLock()
	inst, ok := m.plugins[name]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("plugin %q not registered", name)
	}

	pluginDir := m.absPluginDir(inst)

	// Check if a pre-compiled binary already exists
	candidates := []string{name, name + ".exe", "plugin", "plugin.exe", "main", "main.exe"}
	for _, c := range candidates {
		path := filepath.Join(pluginDir, c)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return nil // binary exists
		}
	}

	// Check if source code is available
	mainGo := filepath.Join(pluginDir, "main.go")
	if _, err := os.Stat(mainGo); err != nil {
		return fmt.Errorf("no pre-built binary and no main.go to compile in %s", pluginDir)
	}

	// Remove stale artifact (file or directory) so -o produces a clean binary
	binaryName := name + ".exe"
	os.RemoveAll(filepath.Join(pluginDir, name))
	os.RemoveAll(filepath.Join(pluginDir, binaryName))

	cmd := exec.Command("go", "build", "-o", binaryName, ".")
	cmd.Dir = pluginDir
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("go build failed: %w\n%s", err, string(out))
	}

	m.logger.Printf("[INFO] Built plugin binary: %s", name)
	return nil
}

// ==================== Health ====================

// CheckHealth runs health checks on a specific plugin.
func (m *Manager) CheckHealth(name string) *PluginHealth {
	m.mu.RLock()
	inst, ok := m.plugins[name]
	m.mu.RUnlock()
	if !ok {
		return &PluginHealth{Healthy: false, Message: "not found"}
	}
	if inst.State != StateRunning {
		return &PluginHealth{Healthy: false, Message: fmt.Sprintf("state: %s", inst.State)}
	}

	url := fmt.Sprintf("http://127.0.0.1:%d/__plugin/health", inst.Port)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		h := &PluginHealth{Healthy: false, Message: err.Error(), LastCheck: time.Now()}
		m.updateHealth(name, *h)
		return h
	}
	defer resp.Body.Close()

	var health PluginHealth
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		health = PluginHealth{Healthy: resp.StatusCode == 200, Message: "status: " + resp.Status}
	}
	health.LastCheck = time.Now()
	m.updateHealth(name, health)
	return &health
}

// ==================== Hook Dispatch ====================

// DispatchHook sends a hook event to all plugins that registered for it.
func (m *Manager) DispatchHook(hookName string, context map[string]string, async bool) {
	m.mu.RLock()
	var targets []*PluginInstance
	for _, inst := range m.plugins {
		if inst.State != StateRunning {
			continue
		}
		for _, h := range inst.Manifest.Capabilities.Hooks {
			if h == hookName {
				targets = append(targets, inst)
				break
			}
		}
	}
	m.mu.RUnlock()

	for _, inst := range targets {
		if async {
			go m.sendHook(inst, hookName, context, true)
		} else {
			m.sendHook(inst, hookName, context, false)
		}
	}
}

func (m *Manager) sendHook(inst *PluginInstance, hookName string, ctx map[string]string, async bool) {
	url := fmt.Sprintf("http://127.0.0.1:%d/__plugin/hook", inst.Port)
	body, _ := json.Marshal(HookRequest{
		HookName: hookName,
		Context:  ctx,
		Async:    async,
	})

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		m.logger.Printf("[WARN] Hook %s -> plugin %s: %v", hookName, inst.Manifest.Name, err)
		return
	}
	resp.Body.Close()
}

// ==================== Query / State ====================

// Get returns a plugin instance by name.
func (m *Manager) Get(name string) *PluginInstance {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.plugins[name]
}

// List returns all registered plugin instances.
func (m *Manager) List() []*PluginInstance {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]*PluginInstance, 0, len(m.plugins))
	for _, inst := range m.plugins {
		result = append(result, inst)
	}
	return result
}

// Remove stops a plugin (if running) and removes it from the manager and disk.
func (m *Manager) Remove(name string) error {
	m.mu.Lock()
	inst, ok := m.plugins[name]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("plugin %q not registered", name)
	}
	if inst.State == StateRunning {
		m.mu.Unlock()
		if err := m.Stop(name); err != nil {
			return err
		}
		m.mu.Lock()
		inst, ok = m.plugins[name] // re-fetch after releasing lock
		if !ok {
			m.mu.Unlock()
			return nil
		}
	}
	pluginDir := m.absPluginDir(inst)
	delete(m.plugins, name)
	m.mu.Unlock()

	// Remove from disk
	if err := os.RemoveAll(pluginDir); err != nil {
		m.logger.Printf("[WARN] Remove plugin %s disk cleanup: %v", name, err)
	}

	m.logger.Printf("[INFO] Removed plugin: %s", name)
	return nil
}

// BaseDir returns the root directory containing the plugins/ folder.
func (m *Manager) BaseDir() string { return m.baseDir }

// ProxyURL returns the base URL for proxying to this plugin's HTTP server.
func (m *Manager) ProxyURL(name string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	inst, ok := m.plugins[name]
	if !ok || inst.State != StateRunning {
		return ""
	}
	return fmt.Sprintf("http://127.0.0.1:%d", inst.Port)
}

// ==================== Internal ====================

func (m *Manager) findBinary(name string) string {
	m.mu.RLock()
	inst, ok := m.plugins[name]
	m.mu.RUnlock()
	if !ok {
		return ""
	}

	pluginDir := m.absPluginDir(inst)

	// Common binary names for the plugin
	candidates := []string{
		name,
		name + ".exe",
		"plugin",
		"plugin.exe",
		"main",
		"main.exe",
	}

	for _, candidate := range candidates {
		path := filepath.Join(pluginDir, candidate)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}

	// Also try building from source
	mainGo := filepath.Join(pluginDir, "main.go")
	if info, err := os.Stat(mainGo); err == nil && !info.IsDir() {
		return buildPlugin(pluginDir, name)
	}

	return ""
}

func buildPlugin(dir, name string) string {
	binaryName := name + ".exe"
	// Remove stale artifact so -o produces a clean binary
	os.RemoveAll(filepath.Join(dir, name))
	os.RemoveAll(filepath.Join(dir, binaryName))

	cmd := exec.Command("go", "build", "-o", binaryName, ".")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		log.Printf("[PluginManager] Build plugin %s: %v", name, err)
		return ""
	}
	path := filepath.Join(dir, binaryName)
	if info, err := os.Stat(path); err == nil && !info.IsDir() {
		return path
	}
	return filepath.Join(dir, name) // fallback for non-Windows
}

// absPluginDir returns the absolute path to a plugin's directory on disk.
func (m *Manager) absPluginDir(inst *PluginInstance) string {
	rel := filepath.Join(m.baseDir, pluginDir, inst.Manifest.PluginDir())
	abs, err := filepath.Abs(rel)
	if err != nil {
		return rel // fallback to relative (will likely fail later)
	}
	return abs
}

func (m *Manager) callInit(ctx context.Context, inst *PluginInstance) error {
	url := fmt.Sprintf("http://127.0.0.1:%d/__plugin/init", inst.Port)

	initPayload := map[string]interface{}{
		"plugin_id":    inst.Manifest.Name,
		"data_dir":     inst.DataDir,
		"config":       string(inst.Config),
		"workspace_id": "",
	}
	body, _ := json.Marshal(initPayload)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("init request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("init returned status %d", resp.StatusCode)
	}

	return nil
}

func (m *Manager) setState(name string, state PluginState, errMsg string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if inst, ok := m.plugins[name]; ok {
		inst.State = state
		inst.Error = errMsg
	}
}

func (m *Manager) updateHealth(name string, health PluginHealth) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if inst, ok := m.plugins[name]; ok {
		inst.Health = health
	}
}
