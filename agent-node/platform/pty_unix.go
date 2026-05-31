//go:build darwin || linux

package platform

import (
	"os/exec"
	"syscall"

	"github.com/creack/pty"
)

type UnixPTY struct {
	cmd    *exec.Cmd
	ptmx   *os.File
}

func NewUnixPTY() *UnixPTY {
	return &UnixPTY{}
}

func (u *UnixPTY) Open(cmdPath string, args []string, env []string) error {
	u.cmd = exec.Command(cmdPath, args...)
	if env != nil {
		u.cmd.Env = env
	}

	var err error
	u.ptmx, err = pty.Start(u.cmd)
	if err != nil {
		return err
	}
	return nil
}

func (u *UnixPTY) Read(b []byte) (int, error) {
	return u.ptmx.Read(b)
}

func (u *UnixPTY) Write(b []byte) (int, error) {
	return u.ptmx.Write(b)
}

func (u *UnixPTY) Resize(width, height int) error {
	return pty.Setsize(u.ptmx, &pty.Winsize{
		Rows: uint16(height),
		Cols: uint16(width),
	})
}

func (u *UnixPTY) Close() error {
	if u.cmd != nil && u.cmd.Process != nil {
		u.cmd.Process.Signal(syscall.SIGTERM)
	}
	return u.ptmx.Close()
}

func (u *UnixPTY) PID() int {
	if u.cmd != nil && u.cmd.Process != nil {
		return u.cmd.Process.Pid
	}
	return 0
}

func (u *UnixPTY) Pause() error {
	if u.cmd != nil && u.cmd.Process != nil {
		return u.cmd.Process.Signal(syscall.SIGSTOP)
	}
	return nil
}

func (u *UnixPTY) Resume() error {
	if u.cmd != nil && u.cmd.Process != nil {
		return u.cmd.Process.Signal(syscall.SIGCONT)
	}
	return nil
}
