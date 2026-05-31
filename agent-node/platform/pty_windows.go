//go:build windows

package platform

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

var (
	kernel32                = syscall.MustLoadDLL("kernel32.dll")
	procCreatePseudoConsole = kernel32.MustFindProc("CreatePseudoConsole")
	procClosePseudoConsole  = kernel32.MustFindProc("ClosePseudoConsole")
	procResizePseudoConsole = kernel32.MustFindProc("ResizePseudoConsole")
)

type WindowsPTY struct {
	cmd        *exec.Cmd
	outputR    *os.File
	outputW    *os.File
	inputR     *os.File
	inputW     *os.File
	hPC        syscall.Handle
	pid        int
}

func NewWindowsPTY() *WindowsPTY {
	return &WindowsPTY{}
}

func (w *WindowsPTY) Open(cmdPath string, args []string, dir string, env []string) error {
	// Create pipes for input/output
	var err error
	w.outputR, w.outputW, err = os.Pipe()
	if err != nil {
		return fmt.Errorf("failed to create output pipe: %w", err)
	}

	w.inputR, w.inputW, err = os.Pipe()
	if err != nil {
		return fmt.Errorf("failed to create input pipe: %w", err)
	}

	// Start command directly on Windows
	w.cmd = exec.Command(cmdPath, args...)
	if dir != "" {
		w.cmd.Dir = dir
	}
	if env != nil {
		w.cmd.Env = env
	}
	w.cmd.Stdin = w.inputR
	w.cmd.Stdout = w.outputW
	w.cmd.Stderr = w.outputW
	if err := w.cmd.Start(); err != nil {
		return fmt.Errorf("failed to start command: %w", err)
	}
	w.pid = w.cmd.Process.Pid

	return nil
}

func (w *WindowsPTY) Read(b []byte) (int, error) {
	return w.outputR.Read(b)
}

func (w *WindowsPTY) Write(b []byte) (int, error) {
	return w.inputW.Write(b)
}

func (w *WindowsPTY) Resize(width, height int) error {
	// ConPTY resize
	_, _, _ = procResizePseudoConsole.Call(
		uintptr(w.hPC),
		uintptr(uint32(height)<<16|uint32(width)),
	)
	return nil
}

func (w *WindowsPTY) Close() error {
	if w.hPC != 0 {
		_, _, _ = procClosePseudoConsole.Call(uintptr(w.hPC))
	}
	if w.cmd != nil && w.cmd.Process != nil {
		w.cmd.Process.Kill()
	}
	w.outputR.Close()
	w.outputW.Close()
	w.inputR.Close()
	w.inputW.Close()
	return nil
}

func (w *WindowsPTY) PID() int {
	return w.pid
}

func (w *WindowsPTY) Pause() error {
	if w.cmd != nil && w.cmd.Process != nil {
		hThread := syscall.Handle(w.cmd.Process.Pid)
		_, _, _ = procSuspendThread.Call(uintptr(hThread))
	}
	return nil
}

func (w *WindowsPTY) Resume() error {
	if w.cmd != nil && w.cmd.Process != nil {
		hThread := syscall.Handle(w.cmd.Process.Pid)
		_, _, _ = procResumeThread.Call(uintptr(hThread))
	}
	return nil
}

var (
	procSuspendThread = kernel32.MustFindProc("SuspendThread")
	procResumeThread  = kernel32.MustFindProc("ResumeThread")
)

// WSLPath converts a Windows path (e.g. "D:/halo") to a WSL path ("/mnt/d/halo").
func WSLPath(windowsPath string) string {
	if len(windowsPath) < 2 || windowsPath[1] != ':' {
		return windowsPath
	}
	drive := string(windowsPath[0])
	rest := windowsPath[2:]
	return "/mnt/" + drive + "/" + rest
}

