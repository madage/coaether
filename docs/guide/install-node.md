# 安装节点

Agent Runtime 节点是执行智能体任务的计算单元。你可以将它部署在任意有网络连接的机器上。

## 一键安装

在平台「节点管理」页面获取安装脚本，在目标机器上执行：

```bash
curl -fsSL https://www.coaether.cn/api/nodes/install.sh | bash
```

脚本会自动检测系统环境、下载对应二进制文件、启动节点服务。

## 支持的平台

| 操作系统 | 架构 | 说明 |
|----------|------|------|
| Linux | amd64 / arm64 | 推荐 Ubuntu 20.04+ 或 CentOS 8+ |
| macOS | amd64 / arm64 | 支持 Intel 和 Apple Silicon |
| Windows | amd64 | 支持 Windows 10+ |

## 手动安装

如果你的环境无法使用自动安装脚本，也可以手动安装：

1. 从 [GitHub Releases](https://github.com/madage/coaether/releases) 下载对应平台的 `agent-runtime` 二进制
2. 在平台「节点管理」页面生成节点加入令牌
3. 使用令牌启动节点：

```bash
./agent-runtime --server wss://www.coaether.cn/ws --token <你的令牌>
```

## 节点配置

节点配置文件默认位于用户目录下的 `.coaether/` 目录：

```
~/.coaether/
├── config.yml      # 节点配置
├── sessions/        # 会话工作区
└── logs/            # 运行日志
```

### 关键配置项

| 配置 | 说明 | 默认值 |
|------|------|--------|
| `server` | 平台 WebSocket 地址 | `wss://www.coaether.cn/ws` |
| `max_sessions` | 最大并发会话数 | `3` |
| `workspace_dir` | 本地工作区路径 | `~/.coaether/sessions/` |
| `log_level` | 日志级别 | `info` |

## 验证节点状态

安装完成后，在平台「节点管理」页面可以看到节点状态变为「在线」。如果长时间离线，请检查：

1. 网络连通性：`ping www.coaether.cn`
2. WebSocket 连通性：节点日志中查看连接状态
3. 防火墙：确保出站 443 端口未被拦截
