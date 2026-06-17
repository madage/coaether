# 安装节点

Agent Runtime 节点是智能体的执行环境。本章涵盖一键安装、手动安装、Docker 部署、配置详解和常见问题。

## 系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|---------|---------|
| CPU | 2 核 | 4 核+ |
| 内存 | 512 MB | 2 GB+ |
| 磁盘 | 100 MB | 1 GB+（含会话工作区） |
| 网络 | 出站 HTTPS (443) | 低延迟稳定连接 |
| 操作系统 | Linux / macOS / Windows | Ubuntu 22.04+ |

## 一键安装

在目标机器上执行：

```bash
curl -fsSL https://www.coaether.cn/api/nodes/install.sh | bash
```

**脚本做了什么：**

1. 检测操作系统和 CPU 架构
2. 下载对应平台的 agent-runtime 二进制
3. 创建 `~/.coaether/` 配置目录
4. 生成默认配置文件
5. 提示输入节点令牌
6. 安装 systemd 服务（Linux）或 launchd（macOS）
7. 启动节点

### 非交互式安装

```bash
curl -fsSL https://www.coaether.cn/api/nodes/install.sh | \
  bash -s -- --token <your-token> --max-sessions 3 --name "my-server"
```

## 手动安装

### Linux

```bash
# 下载
ARCH=$(uname -m)
case $ARCH in
  x86_64)  BIN="agent-runtime-linux-amd64" ;;
  aarch64) BIN="agent-runtime-linux-arm64" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

wget "https://github.com/madage/coaether/releases/latest/download/$BIN"
sudo mv "$BIN" /usr/local/bin/agent-runtime
sudo chmod +x /usr/local/bin/agent-runtime

# 配置
mkdir -p ~/.coaether
cat > ~/.coaether/config.yml << EOF
server: wss://www.coaether.cn/ws
token: "<在平台生成的令牌>"
max_sessions: 3
name: "my-node"
workspace_dir: "~/.coaether/sessions"
log_level: info
EOF

# 创建 systemd 服务
sudo tee /etc/systemd/system/coaether-node.service << EOF
[Unit]
Description=CoAether Agent Runtime Node
After=network.target

[Service]
Type=simple
User=$(whoami)
ExecStart=/usr/local/bin/agent-runtime
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now coaether-node
```

### macOS

```bash
brew install madage/tap/coaether-agent-runtime

# 或手动下载
curl -L -o agent-runtime \
  "https://github.com/madage/coaether/releases/latest/download/agent-runtime-darwin-amd64"
chmod +x agent-runtime
sudo mv agent-runtime /usr/local/bin/
```

### Windows

```powershell
# PowerShell (管理员)
Invoke-WebRequest -Uri "https://github.com/madage/coaether/releases/latest/download/agent-runtime-windows-amd64.exe" -OutFile "$env:ProgramFiles\CoAether\agent-runtime.exe"

# 创建配置
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.coaether"
@"
server: wss://www.coaether.cn/ws
token: "<你的令牌>"
max_sessions: 3
"@ | Out-File -FilePath "$env:USERPROFILE\.coaether\config.yml" -Encoding utf8
```

## Docker 部署

```bash
# 拉取镜像
docker pull ghcr.io/madage/coaether-agent-runtime:latest

# 运行
docker run -d \
  --name coaether-node \
  --restart unless-stopped \
  -e COAETHER_TOKEN="<你的令牌>" \
  -e COAETHER_SERVER="wss://www.coaether.cn/ws" \
  -e COAETHER_MAX_SESSIONS=3 \
  -v coaether-sessions:/home/node/.coaether/sessions \
  ghcr.io/madage/coaether-agent-runtime:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  coaether-node:
    image: ghcr.io/madage/coaether-agent-runtime:latest
    container_name: coaether-node
    restart: unless-stopped
    environment:
      COAETHER_TOKEN: "<你的令牌>"
      COAETHER_SERVER: wss://www.coaether.cn/ws
      COAETHER_MAX_SESSIONS: 5
      COAETHER_LOG_LEVEL: info
    volumes:
      - sessions_data:/home/node/.coaether/sessions
      - ./custom-agents:/home/node/.coaether/agents:ro

volumes:
  sessions_data:
```

## 配置详解

配置文件位置：`~/.coaether/config.yml`

```yaml
# === 连接配置 ===
server: wss://www.coaether.cn/ws    # 平台 WebSocket 地址
token: "coaether_node_xxxx"        # 节点接入令牌（在平台生成）

# === 节点标识 ===
name: "生产服务器 01"               # 在平台上显示的节点名称

# === 并发控制 ===
max_sessions: 5                    # 最大并发会话数（1-20）

# === 本地路径 ===
workspace_dir: ~/.coaether/sessions # 会话工作区文件存储
log_dir: ~/.coaether/logs          # 日志目录

# === 日志 ===
log_level: info                    # debug | info | warn | error

# === 网络 ===
proxy: ""                          # HTTP 代理（可选）
                                  # 格式: http://proxy:8080

# === 模型配置 ===
models:                            # 本地模型配置（可选）
  ollama:
    base_url: http://localhost:11434
    default_model: llama3
```

## 验证安装

### 检查节点日志

```bash
tail -f ~/.coaether/logs/runtime.log
```

正常启动的日志示例：

```
[2026-06-18 10:00:01] INFO  Agent Runtime v2.1.0 starting
[2026-06-18 10:00:01] INFO  Loading config from ~/.coaether/config.yml
[2026-06-18 10:00:02] INFO  Connecting to wss://www.coaether.cn/ws
[2026-06-18 10:00:02] INFO  WebSocket connected (session: abc123)
[2026-06-18 10:00:03] INFO  Node registered: "生产服务器 01" (linux/amd64)
[2026-06-18 10:00:03] INFO  Ready. Max sessions: 5
```

### 平台验证

在 CoAether → 节点管理页面，应该看到：
- 节点名称为你配置的 name
- 状态：🟢 在线
- 系统信息、IP、并发配置正确显示

### 功能测试

创建一个简单任务并分配给该节点上的智能体，观察执行过程：

1. 创建任务，选择 `auto_assign`
2. 观察任务状态从 `todo` → `in_progress`
3. 查看节点日志确认智能体在执行
4. 确认任务完成

## 连接到本地模型（Ollama）

如果你的节点运行了 Ollama，可以配置智能体使用本地模型：

```yaml
# ~/.coaether/config.yml
models:
  ollama:
    base_url: http://localhost:11434
    default_model: qwen2.5:14b
```

在创建智能体时，模型选择对应的本地模型即可。

## 节点令牌管理

- 每个节点需要一个独立的令牌
- 令牌在平台「节点管理」→「生成令牌」创建
- 令牌可设置有效期和工作区范围
- 令牌泄露后可立即吊销
- 一个令牌只对一个节点有效（使用后绑定）

## 多节点部署

对于需要更多并发能力的场景，部署多个节点：

```
┌─────────────┐
│ CoAether    │
│ Server      │
└──┬──┬──┬───┘
   │  │  │
   ▼  ▼  ▼
  N1 N2 N3     ← 3 个 Agent Runtime 节点
```

- 每个节点独立配置和管理
- 智能体可以在任意在线节点上执行
- 负载自动分配到在线节点
- 某节点离线不影响其他节点

## 常见问题

### 节点显示离线

1. 检查网络：`curl -I https://www.coaether.cn`
2. 检查令牌是否过期或吊销
3. 查看日志：`tail -100 ~/.coaether/logs/runtime.log`
4. 检查防火墙：出站 TCP 443 端口必须开放

### WebSocket 连接失败

```bash
# 手动测试 WebSocket
wscat -c wss://www.coaether.cn/ws

# 如果使用代理
export HTTPS_PROXY=http://proxy:8080
agent-runtime
```

### 会话占满

如果看到 `max_sessions reached` 日志：
- 提高 `max_sessions` 配置值
- 或部署更多节点分担负载

### 性能优化

```yaml
max_sessions: 3    # 不要超过 CPU 核心数
```

每个会话可能占用一个 CPU 核心，合理设置并发数避免性能下降。

### 防火墙配置

| 端口 | 方向 | 协议 | 用途 |
|------|------|------|------|
| 443 | 出站 | TCP | WebSocket 连接到平台 |
| 443 | 出站 | TCP | API 调用 LLM 服务 |
| 11434 | 本地 | TCP | 连接本地 Ollama（可选） |
