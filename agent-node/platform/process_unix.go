//go:build darwin || linux

package platform

import (
	"syscall"

	"golang.org/x/term"
)

type UnixProcessController struct {
	pty *UnixPTY
}

func NewProcessController(pty PTY) ProcessController {
	return &UnixProcessController{pty: pty.(*UnixPTY)}
}

func (c *UnixProcessController) Start(cmd string, args []string, dir string, pty PTY) error {
	upty := pty.(*UnixPTY)
	return upty.Open(cmd, args, dir, nil)
}

func (c *UnixProcessController) Stop() error {
	return c.pty.Close()
}

func (c *UnixProcessController) Pause() error {
	return c.pty.Pause()
}

func (c *UnixProcessController) Resume() error {
	return c.pty.Resume()
}

func (c *UnixProcessController) Signal(sig int) error {
	if c.pty.cmd != nil && c.pty.cmd.Process != nil {
		return c.pty.cmd.Process.Signal(syscall.Signal(sig))
	}
	return nil
}

func (c *UnixProcessController) PID() int {
	return c.pty.PID()
}

func IsTerminal(fd int) bool {
	return term.IsTerminal(fd)
}
