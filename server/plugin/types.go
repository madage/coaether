package plugin

import (
	"time"
)

// PluginState represents the current lifecycle state of a plugin.
type PluginState string

const (
	StateDiscovered PluginState = "discovered"
	StateStarting   PluginState = "starting"
	StateRunning    PluginState = "running"
	StateStopping   PluginState = "stopping"
	StateStopped    PluginState = "stopped"
	StateError      PluginState = "error"
)

// PluginType classifies the kind of plugin.
type PluginType string

const (
	TypeCore     PluginType = "core"
	TypeExtension PluginType = "extension"
	TypeRuntime  PluginType = "runtime"
)

// PluginInstance holds the runtime state for a loaded plugin.
type PluginInstance struct {
	Manifest   Manifest
	State      PluginState
	Pid        int
	Port       int // plugin's HTTP server port
	DataDir    string
	Config     []byte
	StartedAt  time.Time
	Error      string
	Health     PluginHealth
}

// PluginHealth holds the latest health check result.
type PluginHealth struct {
	Healthy    bool
	Message    string
	LastCheck  time.Time
	UptimeMs   int64
}

// HookRequest is sent from host to plugin for hook events.
type HookRequest struct {
	HookName string            `json:"hook_name"`
	Context  map[string]string `json:"context"`
	Async    bool              `json:"async"`
}

// HookResponse is received from the plugin after a hook invocation.
type HookResponse struct {
	Aborted        bool              `json:"aborted"`
	ErrorMessage   string            `json:"error_message,omitempty"`
	MutatedContext map[string]string `json:"mutated_context,omitempty"`
}
