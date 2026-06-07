package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"
)

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "关闭正在运行的 runtime",
	Long: `停止正在后台运行的 Agent Runtime 进程。

通过 PID 文件找到进程并发送关闭信号。支持超时后强制终止。`,
	RunE: func(cmd *cobra.Command, args []string) error {
		pidFile, _ := cmd.Flags().GetString("pidfile")
		timeout, _ := cmd.Flags().GetInt("timeout")
		force, _ := cmd.Flags().GetBool("force")

		if pidFile == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return fmt.Errorf("cannot get home dir: %w", err)
			}
			pidFile = filepath.Join(home, ".coaether", "runtime.pid")
		}

		return stopRuntime(pidFile, timeout, force)
	},
}

func init() {
	stopCmd.Flags().String("pidfile", "", "PID 文件路径 (默认: ~/.coaether/runtime.pid)")
	stopCmd.Flags().Int("timeout", 10, "等待优雅关闭的超时秒数")
	stopCmd.Flags().BoolP("force", "f", false, "跳过优雅关闭，直接强制终止")
}

func stopRuntime(pidFile string, timeout int, force bool) error {
	pidBytes, err := os.ReadFile(pidFile)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("runtime 未在运行 (PID 文件不存在: %s)", pidFile)
		}
		return fmt.Errorf("读取 PID 文件失败: %w", err)
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(pidBytes)))
	if err != nil {
		return fmt.Errorf("PID 文件内容无效: %w", err)
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		os.Remove(pidFile)
		return fmt.Errorf("找不到进程 %d (已清除 PID 文件)", pid)
	}

	fmt.Printf("正在停止 runtime (PID %d)...\n", pid)

	if force {
		if err := proc.Kill(); err != nil {
			return fmt.Errorf("强制终止失败: %w", err)
		}
	} else {
		if runtime.GOOS == "windows" {
			// Windows: use taskkill for graceful termination
			kill := exec.Command("taskkill", "/PID", strconv.Itoa(pid))
			kill.Run()
		} else {
			proc.Signal(os.Interrupt)
		}

		// Wait for process to exit with timeout
		deadline := time.After(time.Duration(timeout) * time.Second)
		poll := time.NewTicker(500 * time.Millisecond)
		defer poll.Stop()

		exited := false
		for {
			select {
			case <-deadline:
				fmt.Printf("超时，正在强制终止...\n")
				proc.Kill()
				exited = true
			case <-poll.C:
				if !processExists(pid) {
					exited = true
				}
			}
			if exited {
				break
			}
		}
	}

	os.Remove(pidFile)
	fmt.Println("runtime 已停止")
	return nil
}

func processExists(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	if runtime.GOOS != "windows" {
		// On Unix, signal 0 checks existence
		if err := proc.Signal(os.Signal(syscall.Signal(0))); err != nil {
			return false
		}
	} else {
		// On Windows, use tasklist to check
		cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid))
		out, err := cmd.Output()
		if err != nil {
			return false
		}
		// tasklist output contains the PID if running
		if !strings.Contains(string(out), strconv.Itoa(pid)) {
			return false
		}
	}
	return true
}
