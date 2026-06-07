package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "管理配置文件",
	Long: `管理 ~/.coaether/env 配置文件。

支持 list（列出所有配置）、get（查看单个配置）、set（设置配置值）。`,
}

var configListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出所有配置",
	RunE: func(cmd *cobra.Command, args []string) error {
		path, _ := cmd.Flags().GetString("config")
		if path == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return fmt.Errorf("cannot get home dir: %w", err)
			}
			path = filepath.Join(home, ".coaether", "env")
		}
		return listConfig(path)
	},
}

var configGetCmd = &cobra.Command{
	Use:   "get <key>",
	Short: "查看单个配置值",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		path, _ := cmd.Flags().GetString("config")
		if path == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return fmt.Errorf("cannot get home dir: %w", err)
			}
			path = filepath.Join(home, ".coaether", "env")
		}
		return getConfig(path, args[0])
	},
}

var configSetCmd = &cobra.Command{
	Use:   "set <key>=<value>",
	Short: "设置配置值",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		path, _ := cmd.Flags().GetString("config")
		if path == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return fmt.Errorf("cannot get home dir: %w", err)
			}
			path = filepath.Join(home, ".coaether", "env")
		}
		return setConfig(path, args[0])
	},
}

func init() {
	configCmd.AddCommand(configListCmd)
	configCmd.AddCommand(configGetCmd)
	configCmd.AddCommand(configSetCmd)

	configListCmd.Flags().String("config", "", "配置文件路径 (默认: ~/.coaether/env)")
	configGetCmd.Flags().String("config", "", "配置文件路径 (默认: ~/.coaether/env)")
	configSetCmd.Flags().String("config", "", "配置文件路径 (默认: ~/.coaether/env)")
}

func envPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".coaether", "env")
}

func readEnvFile(path string) (map[string]string, []string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return make(map[string]string), nil, nil
		}
		return nil, nil, err
	}

	env := make(map[string]string)
	var rawLines []string
	for _, line := range strings.Split(string(data), "\n") {
		rawLines = append(rawLines, line)
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			env[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return env, rawLines, nil
}

func listConfig(path string) error {
	env, _, err := readEnvFile(path)
	if err != nil {
		return fmt.Errorf("读取配置文件失败: %w", err)
	}

	if len(env) == 0 {
		fmt.Printf("配置文件为空或不存在: %s\n", path)
		return nil
	}

	fmt.Printf("配置文件: %s\n\n", path)

	keys := make([]string, 0, len(env))
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, k := range keys {
		v := env[k]
		// Mask sensitive values
		if strings.Contains(k, "SECRET") || strings.Contains(k, "TOKEN") {
			if len(v) > 8 {
				v = v[:4] + "****" + v[len(v)-4:]
			} else if v != "" {
				v = "****"
			}
		}
		fmt.Printf("  %s = %s\n", k, v)
	}
	return nil
}

func getConfig(path, key string) error {
	env, _, err := readEnvFile(path)
	if err != nil {
		return fmt.Errorf("读取配置文件失败: %w", err)
	}

	val, ok := env[key]
	if !ok {
		return fmt.Errorf("配置项 '%s' 未设置", key)
	}
	fmt.Println(val)
	return nil
}

func setConfig(path, kv string) error {
	parts := strings.SplitN(kv, "=", 2)
	if len(parts) != 2 {
		return fmt.Errorf("格式无效，请使用 key=value 格式")
	}
	key := strings.TrimSpace(parts[0])
	value := strings.TrimSpace(parts[1])

	if key == "" {
		return fmt.Errorf("键名不能为空")
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	// Read existing file
	env, rawLines, err := readEnvFile(path)
	if err != nil {
		return fmt.Errorf("读取配置文件失败: %w", err)
	}

	if _, exists := env[key]; exists {
		// Update in place
		for i, line := range rawLines {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			parts := strings.SplitN(trimmed, "=", 2)
			if len(parts) == 2 && strings.TrimSpace(parts[0]) == key {
				rawLines[i] = key + "=" + value
				break
			}
		}
	} else {
		// Append
		rawLines = append(rawLines, key+"="+value)
	}

	if err := os.WriteFile(path, []byte(strings.Join(rawLines, "\n")+"\n"), 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	fmt.Printf("已设置 %s = %s\n", key, value)
	return nil
}
