package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "查看 runtime 运行状态",
	Long:  `检查 Agent Runtime 进程是否在运行中。`,
	RunE: func(cmd *cobra.Command, args []string) error {
		pidFile, _ := cmd.Flags().GetString("pidfile")
		jsonOut, _ := cmd.Flags().GetBool("json")

		if pidFile == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return fmt.Errorf("cannot get home dir: %w", err)
			}
			pidFile = filepath.Join(home, ".coaether", "runtime.pid")
		}

		return showStatus(pidFile, jsonOut)
	},
}

func init() {
	statusCmd.Flags().String("pidfile", "", "PID 文件路径 (默认: ~/.coaether/runtime.pid)")
	statusCmd.Flags().BoolP("json", "j", false, "以 JSON 格式输出")
}

func showStatus(pidFile string, jsonOut bool) error {
	pidBytes, err := os.ReadFile(pidFile)
	if err != nil {
		if os.IsNotExist(err) {
			if jsonOut {
				j, _ := json.Marshal(map[string]interface{}{
					"status": "stopped",
					"pid":    0,
					"pidfile": pidFile,
				})
				fmt.Println(string(j))
			} else {
				fmt.Println("runtime 状态: 未运行")
				fmt.Printf("PID 文件: %s (不存在)\n", pidFile)
			}
			return nil
		}
		return fmt.Errorf("读取 PID 文件失败: %w", err)
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(pidBytes)))
	if err != nil {
		return fmt.Errorf("PID 文件内容无效: %w", err)
	}

	alive := processExists(pid)

	if jsonOut {
		j, _ := json.Marshal(map[string]interface{}{
			"status":  map[bool]string{true: "running", false: "stopped"}[alive],
			"pid":     pid,
			"pidfile": pidFile,
			"alive":   alive,
		})
		fmt.Println(string(j))
	} else {
		if alive {
			fmt.Printf("runtime 状态: 运行中 (PID %d)\n", pid)
		} else {
			fmt.Printf("runtime 状态: 未运行 (PID 文件残留: %d)\n", pid)
		}
		fmt.Printf("PID 文件: %s\n", pidFile)
	}

	return nil
}
