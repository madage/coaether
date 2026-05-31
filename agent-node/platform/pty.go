package platform

import "io"

// PTY is the common interface for pseudo-terminal operations across platforms.
type PTY interface {
	io.ReadWriter
	Resize(width, height int) error
	Close() error
}

// ProcessController controls the lifecycle of a child process.
type ProcessController interface {
	Start(cmd string, args []string, pty PTY) error
	Stop() error
	Pause() error
	Resume() error
	Signal(sig int) error
	PID() int
}
