//go:build windows

package platform

type WindowsProcessController struct {
	pty *WindowsPTY
}

func NewProcessController(pty PTY) ProcessController {
	return &WindowsProcessController{pty: pty.(*WindowsPTY)}
}

func (c *WindowsProcessController) Start(cmd string, args []string, dir string, pty PTY) error {
	wpty := pty.(*WindowsPTY)
	return wpty.Open(cmd, args, dir, nil)
}

func (c *WindowsProcessController) Stop() error {
	return c.pty.Close()
}

func (c *WindowsProcessController) Pause() error {
	return c.pty.Pause()
}

func (c *WindowsProcessController) Resume() error {
	return c.pty.Resume()
}

func (c *WindowsProcessController) Signal(sig int) error {
	// Windows doesn't have POSIX signals; use WSL for Claude Code
	return nil
}

func (c *WindowsProcessController) PID() int {
	return c.pty.PID()
}

