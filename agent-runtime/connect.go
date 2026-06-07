package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"time"

	"github.com/gorilla/websocket"
	"github.com/spf13/cobra"
	"github.com/coaether/server/protocol"
)

var connectCmd = &cobra.Command{
	Use:   "connect",
	Short: "测试与服务器的连接",
	Long: `测试与 CoAether 服务器的 WebSocket 连接。

建立连接、发送握手消息、接收回应，然后断开。
用于诊断网络连接和认证问题。`,
	RunE: func(cmd *cobra.Command, args []string) error {
		server, _ := cmd.Flags().GetString("server")
		token, _ := cmd.Flags().GetString("token")
		secret, _ := cmd.Flags().GetString("secret")
		timeout, _ := cmd.Flags().GetInt("timeout")

		if server == "" {
			server = "localhost:8088"
		}
		if token == "" && secret == "" {
			return fmt.Errorf("需要 --token 或 --secret 参数")
		}

		return testConnect(server, token, secret, timeout)
	},
}

func init() {
	connectCmd.Flags().StringP("server", "s", "", "服务器地址 (默认: localhost:8088)")
	connectCmd.Flags().StringP("token", "t", "", "一次性注册令牌")
	connectCmd.Flags().String("secret", "", "持久连接密钥")
	connectCmd.Flags().Int("timeout", 5, "连接超时秒数")
}

func testConnect(server, token, secret string, timeout int) error {
	q := url.Values{"type": {"runtime"}}
	if secret != "" {
		q.Set("secret", secret)
		q.Set("node_id", "connect-test")
	} else if token != "" {
		q.Set("token", token)
		q.Set("node_id", "connect-test")
	}

	u := url.URL{
		Scheme:   "ws",
		Host:     server,
		Path:     "/ws/bus",
		RawQuery: q.Encode(),
	}

	fmt.Printf("正在连接 %s ...\n", u.String())

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	dialer := *websocket.DefaultDialer
	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("连接失败: %w", err)
	}
	defer conn.Close()

	fmt.Println("WebSocket 连接已建立")

	// Send hello
	hello := protocol.NewEnvelope("runtime://connect-test", "system://bus", protocol.MsgHello, nil)
	if err := conn.WriteJSON(hello); err != nil {
		return fmt.Errorf("发送 hello 失败: %w", err)
	}
	fmt.Println("已发送 hello 消息")

	// Wait for response
	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, msgBytes, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("等待服务器响应超时: %w", err)
	}

	var resp protocol.Envelope
	if err := json.Unmarshal(msgBytes, &resp); err != nil {
		return fmt.Errorf("解析响应失败: %w", err)
	}

	fmt.Printf("收到服务器响应: type=%s, from=%s\n", resp.Type, resp.From)

	if resp.Payload != nil {
		if nid, ok := resp.Payload.Metadata["node_id"]; ok {
			fmt.Printf("分配的节点 ID: %v\n", nid)
		}
		if secret, ok := resp.Payload.Metadata["node_secret"]; ok {
			fmt.Printf("收到节点密钥: %v\n", secret)
		}
	}

	// Send bye
	bye := protocol.NewEnvelope("runtime://connect-test", "system://bus", protocol.MsgBye, nil)
	conn.WriteJSON(bye)
	fmt.Println("连接测试成功!")
	return nil
}
