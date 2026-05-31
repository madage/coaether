package client

import (
	"os/exec"
	"strings"
)

type AgentInfo struct {
	Name    string `json:"name"`
	Command string `json:"command"`
	Version string `json:"version"`
}

var knownAgents = []struct {
	Name    string
	Command string
}{
	{Name: "Claude Code", Command: "claude"},
	{Name: "OpenClaw", Command: "openclaw"},
	{Name: "Codex", Command: "codex"},
	{Name: "Hermes", Command: "hermes"},
}

func scanAgents() []AgentInfo {
	var found []AgentInfo
	for _, a := range knownAgents {
		path, err := exec.LookPath(a.Command)
		if err != nil {
			continue
		}
		info := AgentInfo{
			Name:    a.Name,
			Command: a.Command,
		}

		version := getVersion(a.Command)
		if version != "" {
			info.Version = version
		} else {
			info.Version = path
		}

		found = append(found, info)
	}
	return found
}

func getVersion(cmd string) string {
	out, err := exec.Command(cmd, "--version").Output()
	if err != nil {
		return ""
	}
	v := strings.TrimSpace(string(out))
	if idx := strings.Index(v, "\n"); idx >= 0 {
		v = v[:idx]
	}
	if len(v) > 64 {
		v = v[:64]
	}
	return v
}
