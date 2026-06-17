# 认证 API

## POST /api/auth/register

注册新账号。

**请求体：**

```json
{
  "email": "user@example.com",
  "password": "your-password",
  "confirm_password": "your-password",
  "captcha_code": "123456",
  "invitation_token": "optional-invitation-token"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | 是 | 邮箱地址 |
| `password` | string | 是 | 密码，最少 6 位 |
| `confirm_password` | string | 是 | 必须与 `password` 一致 |
| `captcha_code` | string | 是 | 邮箱收到的 6 位验证码 |
| `invitation_token` | string | 否 | 邀请令牌，用于自动加入工作区 |

**成功响应（201）：**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "user",
  "email": "user@example.com",
  "created_at": "2026-06-18T10:00:00+08:00"
}
```

**错误响应：**

| 状态码 | 错误信息 | 说明 |
|--------|---------|------|
| 400 | `passwords do not match` | 两次密码不一致 |
| 400 | `invalid captcha` | 验证码错误或过期 |
| 400 | `email already registered` | 邮箱已被注册 |
| 400 | `invalid invitation token` | 邀请链接无效或过期 |

---

## POST /api/auth/login

用户登录，返回 JWT Token。

**请求体：**

```json
{
  "email": "user@example.com",
  "password": "your-password"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | 是 | 注册邮箱 |
| `password` | string | 是 | 密码 |

**成功响应（200）：**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "username",
    "email": "user@example.com",
    "avatar": ""
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `token` | string | JWT Token，后续请求在 Authorization 头中携带 |
| `user.id` | uuid | 用户唯一标识 |
| `user.username` | string | 用户名 |
| `user.email` | string | 邮箱 |
| `user.avatar` | string | 头像 URL |

**错误响应：**

| 状态码 | 错误信息 | 说明 |
|--------|---------|------|
| 400 | `invalid email or password` | 邮箱或密码错误 |
| 400 | `missing email or password` | 缺少必填字段 |

**使用示例：**

```bash
# 登录并保存 Token
TOKEN=$(curl -s -X POST https://www.coaether.cn/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "your-password"}' \
  | jq -r '.token')

# 使用 Token 调用其他 API
curl https://www.coaether.cn/api/workspaces \
  -H "Authorization: Bearer $TOKEN"
```

---

## POST /api/auth/captcha

发送邮箱验证码，用于注册。

**请求体：**

```json
{
  "email": "user@example.com"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | 是 | 接收验证码的邮箱 |

**成功响应（200）：**

```json
{
  "message": "验证码已发送",
  "next_send_at": 1697443200,
  "expires_at": 1697443500
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `message` | string | 提示信息 |
| `next_send_at` | unix timestamp | 下次可发送验证码的时间（60秒冷却） |
| `expires_at` | unix timestamp | 验证码过期时间（5分钟有效） |

**错误响应：**

| 状态码 | 错误信息 | 说明 |
|--------|---------|------|
| 429 | `please wait before requesting again` | 60 秒冷却期内 |
| 400 | `invalid email format` | 邮箱格式不正确 |

**注意**：
- 60 秒内只能请求一次验证码
- 验证码有效期 5 分钟
- 未使用的验证码在过期后自动失效

---

## GET /api/auth/captcha/status

查询当前验证码发送状态，用于确认是否在冷却期内。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | 是 | 查询的邮箱 |

**响应（200）：**

```json
{
  "can_send": true,
  "next_send_at": 0,
  "cooldown_remaining": 0
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `can_send` | bool | 当前是否可以发送验证码 |
| `next_send_at` | unix timestamp | 下次可发送的时间（0 表示现在可发送） |
| `cooldown_remaining` | int | 冷却剩余秒数（0 表示可以发送） |

---

## POST /api/auth/refresh

刷新即将过期的 JWT Token，延长登录有效期。

**请求头：**

```
Authorization: Bearer <current-jwt-token>
```

**成功响应（200）：**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**错误响应：**

| 状态码 | 错误信息 | 说明 |
|--------|---------|------|
| 401 | `token expired` | Token 已过期，需重新登录 |
| 401 | `invalid token` | Token 格式错误或被篡改 |
