# 智能体 API

## GET /api/agents/profiles

获取工作区中所有智能体配置。

**查询参数：**
- `workspace_id` (required) — 工作区 ID

**响应：**
```json
{
  "profiles": [
    {
      "id": "uuid",
      "name": "产品经理",
      "avatar": "🤖",
      "description": "将需求转化为 PRD",
      "model": "claude-sonnet-4-6",
      "enabled": true,
      "max_concurrency": 2,
      "current_load": 1,
      "capabilities": { "tools": ["get_task_detail", "add_comment"] },
      "tags": ["产品", "PRD"]
    }
  ]
}
```

## POST /api/agents/profiles

创建智能体配置。

## PUT /api/agents/profiles/:id

更新智能体配置。

## DELETE /api/agents/profiles/:id

删除智能体配置。
