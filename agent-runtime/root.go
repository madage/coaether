package main

import (
	"os"

	"github.com/spf13/cobra"
)

var Version = "dev"

var rootCmd = &cobra.Command{
	Use:   "agent-runtime",
	Short: "CoAether Agent Runtime — 节点运行环境",
	Long: `CoAether Agent Runtime 连接到 CoAether 服务器并提供 AI 代理能力。

支持通过令牌首次注册和通过持久密钥重新连接两种方式。`,
	Run: func(cmd *cobra.Command, args []string) {
		// Default: run start
		startCmd.Run(cmd, args)
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(startCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(connectCmd)
	rootCmd.AddCommand(configCmd)
	rootCmd.AddCommand(versionCmd)

	rootCmd.PersistentFlags().StringP("config", "c", "", "配置文件路径 (默认: ~/.coaether/env)")
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "显示版本信息",
	Run: func(cmd *cobra.Command, args []string) {
		cmd.Printf("agent-runtime version %s\n", Version)
	},
}
