package main

import (
	"os"

	"github.com/spf13/cobra"
)

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "启动 runtime 并连接到服务器",
	Long: `启动 Agent Runtime 并连接到 CoAether 服务器。

支持通过令牌（--token）首次注册或通过持久密钥（--secret）重新连接。
如果未提供任何参数，将从 ~/.coaether/env 文件中读取配置。`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if server, _ := cmd.Flags().GetString("server"); server != "" {
			os.Setenv("SERVER_URL", server)
		}
		if token, _ := cmd.Flags().GetString("token"); token != "" {
			os.Setenv("NODE_TOKEN", token)
		}
		if secret, _ := cmd.Flags().GetString("secret"); secret != "" {
			os.Setenv("NODE_SECRET", secret)
		}
		if name, _ := cmd.Flags().GetString("name"); name != "" {
			os.Setenv("RUNTIME_NAME", name)
		}
		if nodeID, _ := cmd.Flags().GetString("node-id"); nodeID != "" {
			os.Setenv("NODE_ID", nodeID)
		}
		runStart()
		return nil
	},
}

func init() {
	startCmd.Flags().StringP("server", "s", "", "服务器地址 (默认: localhost:8088)")
	startCmd.Flags().StringP("token", "t", "", "一次性注册令牌 (从 Web UI 生成)")
	startCmd.Flags().String("secret", "", "持久连接密钥 (首次注册后自动保存)")
	startCmd.Flags().StringP("name", "n", "", "节点名称 (默认: 主机名)")
	startCmd.Flags().String("node-id", "", "节点 UUID (持久连接时必需，从 Web UI 获取)")
}
