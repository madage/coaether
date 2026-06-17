# 认证 API

## POST /api/auth/login

用户登录。

**请求体：**
```json
{
  "email": "user@example.com",
  "password": "your-password"
}
```

**响应：**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "username",
    "email": "user@example.com"
  }
}
```

## POST /api/auth/register

用户注册（需要验证码和邀请令牌）。

**请求体：**
```json
{
  "email": "user@example.com",
  "password": "password",
  "confirm_password": "password",
  "captcha_code": "123456",
  "invitation_token": "optional-token"
}
```

## POST /api/auth/captcha

发送邮箱验证码。

**请求体：**
```json
{
  "email": "user@example.com"
}
```

**响应：**
```json
{
  "message": "验证码已发送",
  "next_send_at": 1697443200,
  "expires_at": 1697443500
}
```

## GET /api/auth/captcha/status

查询验证码发送状态。
