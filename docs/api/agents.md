# 智能体 API

## GET /api/agents/profiles

获取工作区中所有智能体配置。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workspace_id` | uuid | 是 | 工作区 ID |
| `enabled` | bool | 否 | 过滤启用/禁用的智能体 |

**响应（200）：**

```json
{
  "profiles": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "产品经理",
      "avatar": "📋",
      "description": "将模糊需求转化为结构化 PRD",
      "model": "claude-sonnet-4-6",
      "system_prompt": "你是一名资深产品经理...",
      "instruction_template": "分析需求：{{.TaskDescription}}",
      "enabled": true,
      "max_concurrency": 2,
      "current_load": 1,
      "capabilities": {
        "tools": ["get_task_detail", "add_comment", "update_task_status"]
      },
      "tags": ["产品", "PRD", "需求分析"],
      "created_at": "2026-06-01T08:00:00+08:00",
      "updated_at": "2026-06-15T14:30:00+08:00"
    }
  ],
  "total": 8
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 智能体唯一标识 |
| `name` | string | 显示名称 |
| `avatar` | string | 头像 emoji |
| `description` | string | 角色和能力描述 |
| `model` | string | 使用的 LLM 模型 |
| `system_prompt` | text | 系统提示词 |
| `instruction_template` | text | 指令模板 |
| `enabled` | bool | 是否启用 |
| `max_concurrency` | int | 最大并发处理数 |
| `current_load` | int | 当前正在处理的任务数（只读） |
| `capabilities` | json | 能力声明 |
| `tags` | string[] | 标签 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 最后更新时间 |

**使用示例：**

```bash
curl "https://www.coaether.cn/api/agents/profiles?workspace_id=$WS_ID&enabled=true" \
  -H "Authorization: Bearer $TOKEN"
```

---

## GET /api/agents/profiles/:id

获取单个智能体详情。

```bash
curl "https://www.coaether.cn/api/agents/profiles/$AGENT_ID?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN"
```

响应格式同上，返回单个 `profile` 对象。

---

## POST /api/agents/profiles

创建新的智能体配置。

**请求体：**

```json
{
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "后端程序员",
  "avatar": "🔧",
  "description": "Go 后端开发工程师，擅长 API 设计和数据库优化",
  "model": "claude-sonnet-4-6",
  "system_prompt": "你是一名资深 Go 后端工程师...",
  "instruction_template": "## 任务\n{{.TaskDescription}}\n\n## 要求\n编写完整可运行的 Go 代码",
  "max_concurrency": 2,
  "capabilities": {
    "tools": ["get_task_detail", "add_comment", "update_task_status"]
  },
  "tags": ["后端", "Go", "API"],
  "protocol_version": "v2"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workspace_id` | uuid | 是 | 所属工作区 |
| `name` | string | 是 | 智能体名称 |
| `description` | string | 否 | 描述 |
| `avatar` | string | 否 | 头像 emoji，默认 🤖 |
| `model` | string | 是 | LLM 模型 |
| `system_prompt` | text | 否 | 系统提示词 |
| `instruction_template` | text | 否 | 指令模板 |
| `max_concurrency` | int | 否 | 最大并发，默认 2 |
| `capabilities` | json | 否 | 能力声明 |
| `tags` | string[] | 否 | 标签 |
| `protocol_version` | string | 否 | 协议版本：`v1` 或 `v2`，默认 `v2` |

**成功响应（201）：**

返回创建的智能体对象，与 GET 响应结构一致。

**错误响应：**

| 状态码 | 错误信息 | 说明 |
|--------|---------|------|
| 400 | `name is required` | 缺少名称 |
| 400 | `model is required` | 缺少模型 |
| 403 | `not a member of this workspace` | 不在该工作区 |

---

## PUT /api/agents/profiles/:id

更新智能体配置。只传需要更新的字段。

```bash
curl -X PUT "https://www.coaether.cn/api/agents/profiles/$AGENT_ID?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false,
    "max_concurrency": 3,
    "system_prompt": "更新后的提示词..."
  }'
```

支持部分更新（PATCH 语义），未传的字段保持不变。

**常见更新场景：**

```bash
# 禁用智能体
curl -X PUT "..." -d '{"enabled": false}'

# 调整并发数
curl -X PUT "..." -d '{"max_concurrency": 5}'

# 更新提示词
curl -X PUT "..." -d '{"system_prompt": "新的提示词..."}'
```

---

## DELETE /api/agents/profiles/:id

删除智能体配置。

```bash
curl -X DELETE "https://www.coaether.cn/api/agents/profiles/$AGENT_ID?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**注意**：
- 删除后该智能体不再出现在分配候选列表中
- 已分配给该智能体正在执行的任务不受影响
- 此操作不可撤销

**成功响应（200）：**

```json
{
  "message": "deleted"
}
```

---

## GET /api/agents/queue

查看智能体队列状态，了解任务分配情况。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workspace_id` | uuid | 是 | 工作区 ID |

**响应（200）：**

```json
{
  "queue": [
    {
      "agent_id": "uuid",
      "agent_name": "后端程序员",
      "current_load": 2,
      "max_concurrency": 3,
      "pending_tasks": 1,
      "status": "available"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `agent_id` | 智能体 ID |
| `agent_name` | 智能体名称 |
| `current_load` | 当前正在处理的任务数 |
| `max_concurrency` | 最大并发数 |
| `pending_tasks` | 等待分配的任务数 |
| `status` | `available`（有空闲）/ `full`（满载）/ `disabled`（已禁用）/ `offline`（节点离线） |
