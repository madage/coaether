# 故障排除

本章提供了常见问题的诊断和解决方案，按问题类型组织。

## 诊断工具

在排查问题前，先收集以下信息：

```bash
# 节点日志（最重要的诊断信息）
tail -200 ~/.coaether/logs/runtime.log

# 系统信息
uname -a
free -h
df -h

# 网络连通性
curl -I https://www.coaether.cn
ping -c 5 www.coaether.cn

# 节点服务状态
systemctl status coaether-node
```

## 连接问题

### 节点无法连接到平台

**症状**：节点日志显示 `connection refused` 或 `connection timeout`

**诊断步骤**：

```bash
# 1. 测试 HTTPS 连通性
curl -v https://www.coaether.cn/api/health

# 2. 测试 WebSocket 端口
curl -v -H "Connection: Upgrade" -H "Upgrade: websocket" \
  https://www.coaether.cn/ws

# 3. 检查是否使用了代理
echo $HTTPS_PROXY
echo $http_proxy
```

**解决方案**：

| 原因 | 解决方案 |
|------|---------|
| 防火墙阻止 443 出站 | `firewall-cmd --add-port=443/tcp` 或联系网络管理员 |
| 代理配置错误 | 检查并修正 `~/.coaether/config.yml` 中的 `proxy` 配置 |
| DNS 解析失败 | `nslookup www.coaether.cn`，检查 DNS 配置 |
| TLS 证书问题 | 更新系统 CA 证书：`update-ca-certificates` (Linux) |
| 平台服务异常 | 检查 [CoAether 状态页面](https://www.coaether.cn) |

### WebSocket 频繁重连

**症状**：日志反复出现 `WebSocket reconnecting`

```bash
# 检查网络延迟和丢包
ping -c 100 www.coaether.cn

# 查看重连日志
grep "reconnect" ~/.coaether/logs/runtime.log | tail -20
```

**解决方案**：
- 丢包率 > 5%：改善网络质量或更换服务器位置
- 延迟波动大：考虑部署节点到离平台更近的地域
- 节点服务端会自动重连，短暂断开不影响任务执行

## 任务执行问题

### 任务卡在 in_progress 状态不推进

**症状**：任务已分配但长时间无进展

**诊断**：

1. 查看任务评论，确认智能体最后输出
2. 查看节点日志，确认会话是否活跃
3. 检查智能体的 `agent_loop_count` 是否达上限

**解决方案**：

```bash
# 查看当前会话状态
curl "https://www.coaether.cn/api/tasks/$TASK_ID?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN"
```

- 智能体超时（模型 API 无响应）：给任务添加评论指导方向，或手动重新分配
- 审核循环超限（`max_review_loops`）：手动检查产出质量后直接通过
- 依赖未满足：检查 `depends_on` 指向的子任务状态

### 任务委派专家没有分解任务

**症状**：任务创建后迟迟没有分解计划生成

**检查项**：
1. 任务是否设置了 `auto_assign = true`
2. 任务委派专家智能体是否启用
3. 是否有在线且未满载的节点

**手动触发**：

```bash
curl -X POST "https://www.coaether.cn/api/tasks/$TASK_ID/decompose?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Token 预算耗尽

**症状**：工作流暂停，日志显示 `token budget exceeded`

**解决方案**：
1. 分析 Token 消耗明细，找出异常消耗
2. 如果是合理消耗，在平台增加 `token_budget`
3. 如果是浪费：
   - 精简智能体提示词
   - 减少不必要的审核轮次
   - 缩小任务的 `max_depth`

## 性能优化

### 节点响应变慢

**诊断**：

```bash
# 检查 CPU 使用
htop

# 检查内存
free -h

# 检查磁盘 I/O
iostat -x 1 5

# 检查会话文件大小
du -sh ~/.coaether/sessions/
```

**解决方案**：

| 问题 | 解决方案 |
|------|---------|
| CPU 满载 | 降低 `max_sessions` 或升级配置 |
| 内存不足 | 增加 swap 或升级内存，清理旧会话文件 |
| 磁盘满 | `rm -rf ~/.coaether/sessions/old-workspace/` 清理旧工作区 |
| 模型 API 限流 | 降低并发，使用 `max_concurrency` 控制 |

### 清理过期数据

```bash
# 清理 30 天前的会话文件
find ~/.coaether/sessions/ -type d -mtime +30 -exec rm -rf {} \;

# 归档旧日志
find ~/.coaether/logs/ -name "*.log" -mtime +7 -exec gzip {} \;
```

## 配置错误

### 配置文件格式错误

**症状**：节点启动失败，提示 `invalid config`

常见错误：
- YAML 缩进使用了 Tab（必须使用空格）
- 字符串值包含特殊字符未加引号
- `workspace_dir` 路径不存在

**验证配置文件**：

```bash
# Python 方式验证 YAML 语法
python3 -c "import yaml; yaml.safe_load(open('$HOME/.coaether/config.yml'))"
```

### 令牌无效

**症状**：节点日志显示 `authentication failed` 或 `invalid token`

**检查**：
1. 令牌是否在平台被吊销
2. 令牌是否已过期
3. 是否与其他节点的令牌冲突（一个令牌只能绑定一个节点）

**解决**：在平台「节点管理」页面生成新令牌，更新 `config.yml`，重启节点。

## 系统服务问题

### systemd 服务启动失败

```bash
# 查看服务日志
journalctl -u coaether-node -n 50 --no-pager

# 常见失败原因：
# - 二进制文件权限不足：chmod +x /usr/local/bin/agent-runtime
# - 配置文件缺失：检查 ~/.coaether/config.yml
# - 端口被占用：lsof -i 确认
# - 依赖库缺失：ldd /usr/local/bin/agent-runtime
```

### Docker 容器异常

```bash
# 查看容器日志
docker logs coaether-node --tail 50

# 查看容器状态
docker inspect coaether-node

# 重新启动
docker restart coaether-node
```

## 联系支持

如果以上方案都不能解决问题：

1. **GitHub Issues**：[github.com/madage/coaether/issues](https://github.com/madage/coaether/issues)
   - 附上相关日志（脱敏后）
   - 说明复现步骤
   - 提供系统环境信息

2. **日志脱敏**：提交前务必移除日志中的 Token、密码、IP 地址等敏感信息：

```bash
cat ~/.coaether/logs/runtime.log | \
  sed 's/token:.*/token: [REDACTED]/g' | \
  sed 's/[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}/[IP]/g'
```

## 诊断速查表

| 症状 | 第一检查点 | 工具 |
|------|-----------|------|
| 节点离线 | `systemctl status coaether-node` | systemctl, journalctl |
| 任务不执行 | 智能体启用状态 + 节点在线 | 管理后台 |
| 性能慢 | CPU/内存使用率 | htop, iostat |
| 连接失败 | 网络连通性 | curl, ping |
| 配置错误 | YAML 语法 | python3 yaml 验证 |
| 日志异常 | `~/.coaether/logs/runtime.log` | tail, grep |
