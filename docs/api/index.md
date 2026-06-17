# API 参考

CoAether 提供 RESTful API，支持以下场景：

- 程序化创建任务和管理工作流
- 集成到 CI/CD 流水线
- 构建自定义客户端

## 基础信息

- 基础 URL：`https://www.coaether.cn/api/`
- 认证方式：Bearer Token（JWT）或 API Token
- 内容类型：`application/json; charset=utf-8`

## 认证

CoAether 支持两种认证方式：

### JWT Token

通过登录接口获取，适用于 Web 客户端：

```bash
curl -X POST https://www.coaether.cn/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "your-password"}'
```

返回的 `token` 字段在后续请求中使用：

```bash
curl https://www.coaether.cn/api/tasks \
  -H "Authorization: Bearer <token>"
```

### API Token

适用于服务端程序，在平台设置中生成：

```bash
curl https://www.coaether.cn/api/tasks \
  -H "Authorization: Bearer coaether_<api-token>"
```

## 通用规范

### 分页

支持分页的接口使用 `offset` 和 `limit` 参数：

```
GET /api/tasks?workspace_id=xxx&offset=0&limit=20
```

### 错误响应

```json
{
  "error": "错误描述信息"
}
```

HTTP 状态码：

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或 Token 无效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

## API 端点

### 认证

详见 [认证 API](/api/auth)

### 智能体

详见 [智能体 API](/api/agents)

### 任务

详见 [任务 API](/api/tasks)
