# API 参考

CoAether 提供 RESTful API，支持以下场景：

- 程序化创建任务和管理工作流
- 集成到 CI/CD 流水线
- 构建自定义客户端或自动化工具

## 基础信息

| 项目 | 值 |
|------|------|
| 基础 URL | `https://www.coaether.cn/api` |
| 认证方式 | Bearer Token（JWT）或 API Token |
| 内容类型 | `application/json; charset=utf-8` |
| 字符编码 | UTF-8 |

## 认证

CoAether 支持两种认证方式，所有 API 请求（除登录/注册外）都需要携带认证头。

### JWT Token

通过登录接口获取，适用于 Web 客户端，有过期时间：

```bash
# 1. 登录获取 Token
curl -X POST https://www.coaether.cn/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "your-password"}'

# 2. 在后续请求中携带
curl https://www.coaether.cn/api/tasks?workspace_id=xxx \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### API Token

适用于服务端程序和 CI/CD，在平台「设置」→「API Token」中生成：

```bash
curl https://www.coaether.cn/api/tasks?workspace_id=xxx \
  -H "Authorization: Bearer coaether_at_xxxxxxxxxxxx"
```

**API Token 安全建议**：
- 存储在环境变量或密钥管理服务中
- 设置 IP 白名单限制来源
- 设置合理的过期时间
- 定期轮换

### workspace_id 参数

大部分 API 需要 `workspace_id` 查询参数来指定操作的工作区：

```
GET /api/tasks?workspace_id=550e8400-e29b-41d4-a716-446655440000
```

## 通用规范

### 分页

支持列表分页的接口使用 `offset` 和 `limit`：

```
GET /api/tasks?workspace_id=xxx&offset=0&limit=20
```

| 参数 | 默认值 | 最大值 | 说明 |
|------|--------|--------|------|
| `offset` | `0` | — | 偏移量，从 0 开始 |
| `limit` | `20` | `100` | 每页返回数量 |

响应中包含 `total` 字段表示总数：

```json
{
  "tasks": [...],
  "total": 156
}
```

### 错误响应

所有错误返回统一格式：

```json
{
  "error": "人类可读的错误描述"
}
```

HTTP 状态码：

| 状态码 | 含义 | 常见原因 |
|--------|------|---------|
| 200 | 成功 | — |
| 201 | 创建成功 | — |
| 400 | 请求参数错误 | 缺少必填字段、格式错误 |
| 401 | 未认证 | Token 缺失、过期或无效 |
| 403 | 无权限 | 不在该工作区或角色不足 |
| 404 | 资源不存在 | ID 错误或已删除 |
| 409 | 冲突 | 重复创建、状态不允许操作 |
| 429 | 请求过于频繁 | 触发限流，稍后重试 |
| 500 | 服务器内部错误 | 联系支持 |

### 幂等性

- `GET`、`PUT`、`DELETE` 是幂等的
- `POST` 不是幂等的，重复提交会创建重复资源

### 时间格式

所有时间字段使用 ISO 8601 格式：

```
2026-06-18T10:00:00+08:00
```

## API 端点总览

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/captcha` | 发送邮箱验证码 |
| GET | `/api/auth/captcha/status` | 查询验证码状态 |
| POST | `/api/auth/refresh` | 刷新 JWT Token |

### 智能体

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents/profiles` | 获取智能体列表 |
| POST | `/api/agents/profiles` | 创建智能体 |
| GET | `/api/agents/profiles/:id` | 获取智能体详情 |
| PUT | `/api/agents/profiles/:id` | 更新智能体 |
| DELETE | `/api/agents/profiles/:id` | 删除智能体 |
| GET | `/api/agents/queue` | 查看队列状态 |

### 任务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks` | 获取任务列表 |
| POST | `/api/tasks` | 创建任务 |
| POST | `/api/tasks/batch` | 批量创建任务 |
| GET | `/api/tasks/:id` | 获取任务详情 |
| PUT | `/api/tasks/:id` | 更新任务 |
| DELETE | `/api/tasks/:id` | 删除任务 |
| POST | `/api/tasks/:id/decompose` | 触发任务分解 |
| GET | `/api/tasks/:id/comments` | 获取任务评论 |
| POST | `/api/tasks/:id/comments` | 添加评论 |

### 工作流

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workflows/:id` | 获取工作流详情 |
| GET | `/api/workflows/:id/tasks` | 获取工作流任务树 |
| GET | `/api/workflows/:id/usage` | 获取 Token 用量 |
| GET | `/api/workflows/:id/escalations` | 获取升级记录 |
| POST | `/api/workflows/:id/pause` | 暂停工作流 |
| POST | `/api/workflows/:id/resume` | 恢复工作流 |

### 工作区

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workspaces` | 获取用户的工作区列表 |
| POST | `/api/workspaces` | 创建工作区 |
| GET | `/api/workspaces/:id` | 获取工作区详情 |
| PUT | `/api/workspaces/:id` | 更新工作区设置 |
| POST | `/api/workspaces/:id/invite` | 生成邀请链接 |

## 详细介绍

- [认证 API](/api/auth) — 注册、登录、验证码
- [智能体 API](/api/agents) — 智能体 CRUD、能力声明
- [任务 API](/api/tasks) — 任务生命周期、分解、评论
