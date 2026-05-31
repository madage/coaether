package protocol

import "strings"

// EndpointType represents the type of an endpoint.
type EndpointType string

const (
	EndpointUI      EndpointType = "ui"
	EndpointAgent   EndpointType = "agent"
	EndpointRuntime EndpointType = "runtime"
	EndpointSession EndpointType = "session"
	EndpointSystem  EndpointType = "system"
)

// Addr represents a parsed endpoint address.
// Format: <type>://<path>[/<subpath>...]
// Examples:
//
//	ui://user001/sess_abc
//	agent://node-001/claude/inst_001
//	runtime://node-001
//	session://sess_abc
//	system://bus
type Addr struct {
	Raw   string
	Type  EndpointType
	Parts []string
}

// ParseAddr parses an endpoint address string.
func ParseAddr(raw string) *Addr {
	a := &Addr{Raw: raw}
	rest := raw

	// Split off scheme
	if idx := strings.Index(rest, "://"); idx > 0 {
		a.Type = EndpointType(rest[:idx])
		rest = rest[idx+3:]
	}

	// Split remaining path
	a.Parts = strings.Split(strings.Trim(rest, "/"), "/")
	return a
}

func (a *Addr) String() string { return a.Raw }

// HasPrefix checks if the address matches the given prefix components.
// e.g. Addr("agent://node-001/claude").HasPrefix("agent", "node-001") → true
func (a *Addr) HasPrefix(parts ...string) bool {
	if len(parts) > len(a.Parts) {
		return false
	}
	for i, p := range parts {
		if a.Parts[i] != p {
			return false
		}
	}
	return true
}

// Matches returns true if the address matches the pattern.
// Pattern can use "*" as a wildcard segment.
// e.g. pattern "agent://*/claude/*" matches "agent://node-001/claude/inst_001"
func (a *Addr) Matches(pattern string) bool {
	p := ParseAddr(pattern)
	if a.Type != p.Type {
		return false
	}
	if len(p.Parts) > len(a.Parts) {
		return false
	}
	for i, part := range p.Parts {
		if part == "*" {
			continue
		}
		if i >= len(a.Parts) || a.Parts[i] != part {
			return false
		}
	}
	return true
}

// IsZero returns true if the address is empty.
func (a *Addr) IsZero() bool {
	return a.Raw == "" || a.Type == ""
}
