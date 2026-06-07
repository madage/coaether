package plugin

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
)

// Manifest defines the plugin.json schema.
type Manifest struct {
	Name         string            `json:"name"`
	Version      string            `json:"version"`
	Type         PluginType        `json:"type"`
	Label        map[string]string `json:"label,omitempty"`
	Description  map[string]string `json:"description,omitempty"`
	Author       string            `json:"author,omitempty"`
	Homepage     string            `json:"homepage,omitempty"`
	Icon         string            `json:"icon,omitempty"`
	Capabilities Capabilities      `json:"capabilities"`
	Dependencies Dependencies      `json:"dependencies,omitempty"`
	Permissions  []string          `json:"permissions,omitempty"`
	Frontend     FrontendDecl      `json:"frontend,omitempty"`
}

type Capabilities struct {
	Hooks              []string       `json:"hooks,omitempty"`
	APIRoutes          []string       `json:"api_routes,omitempty"`
	MessageTypes       []string       `json:"message_types,omitempty"`
	FrontendComponents []string       `json:"frontend_components,omitempty"`
	ScheduledTasks     bool           `json:"scheduled_tasks,omitempty"`
	DatabaseMigrations bool           `json:"database_migrations,omitempty"`
	Storage            *StorageDecl   `json:"storage,omitempty"`
	KVStore            []string       `json:"kv_store,omitempty"`
	HTTPPort           int            `json:"http_port,omitempty"` // 0 = auto (random)
}

type StorageDecl struct {
	KVStore []string `json:"kv_store,omitempty"`
	Files   []string `json:"files,omitempty"`
}

type Dependencies struct {
	Plugins  map[string]string `json:"plugins,omitempty"`
	Coaether string            `json:"coaether,omitempty"`
}

type FrontendDecl struct {
	Entry string            `json:"entry,omitempty"`
	Slots map[string]string `json:"slots,omitempty"`
}

var nameRegex = regexp.MustCompile(`^[a-z][a-z0-9-]{2,48}$`)

// LoadManifest reads and validates a plugin.json file.
func LoadManifest(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}

	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}

	if err := m.Validate(); err != nil {
		return nil, err
	}

	return &m, nil
}

// Validate checks all manifest fields against plugin standard rules.
func (m *Manifest) Validate() error {
	if !nameRegex.MatchString(m.Name) {
		return fmt.Errorf("invalid plugin name %q: must match %s", m.Name, nameRegex.String())
	}
	if !isValidSemVer(m.Version) {
		return fmt.Errorf("invalid version %q: must be semver (e.g. 1.0.0)", m.Version)
	}
	switch m.Type {
	case TypeCore, TypeExtension, TypeRuntime:
	default:
		return fmt.Errorf("invalid plugin type %q", m.Type)
	}
	if len(m.Permissions) > 0 {
		valid := validPermissions()
		for _, p := range m.Permissions {
			if !valid[p] {
				return fmt.Errorf("unknown permission %q", p)
			}
		}
	}
	return nil
}

// validPermissions returns the set of all known permission strings.
func validPermissions() map[string]bool {
	return map[string]bool{
		"task:read": true, "task:write": true,
		"project:read": true, "project:write": true,
		"workspace:read": true, "workspace:write": true,
		"user:read": true,
		"agent:execute": true, "agent:manage": true,
		"webhook:read": true, "webhook:write": true,
		"comment:read": true, "comment:write": true,
		"admin:config": true, "admin:plugins": true,
	}
}

// LabelOr returns the label in the requested language, falling back to the plugin name.
func (m *Manifest) LabelOr(lang string) string {
	if m.Label != nil {
		if l, ok := m.Label[lang]; ok && l != "" {
			return l
		}
	}
	return m.Name
}

// isValidSemVer checks basic semver format (major.minor.patch).
func isValidSemVer(v string) bool {
	re := regexp.MustCompile(`^\d+\.\d+\.\d+$`)
	return re.MatchString(v)
}

// PluginDir returns the recommended subdirectory name under plugins/.
func (m *Manifest) PluginDir() string {
	return fmt.Sprintf("%s-%s", m.Name, strings.ReplaceAll(m.Version, ".", "_"))
}
