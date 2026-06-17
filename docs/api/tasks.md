# 任务 API

## GET /api/tasks

获取工作区中的任务列表，支持多条件过滤和分页。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workspace_id` | uuid | 是 | 工作区 ID |
| `status` | string | 否 | 过滤状态：`todo`、`in_progress`、`review`、`done`、`cancelled`、`blocked` |
| `priority` | string | 否 | 过滤优先级：`low`、`medium`、`high` |
| `assignee_id` | uuid | 否 | 过滤指派人 |
| `parent_id` | uuid | 否 | 过滤子任务（传 `null` 只返回根任务） |
| `project_id` | uuid | 否 | 过滤项目 |
| `tag` | string | 否 | 过滤标签 |
| `offset` | int | 否 | 偏移量，默认 0 |
| `limit` | int | 否 | 每页数量，默认 20，最大 100 |

**响应（200）：**

```json
{
  "tasks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "开发用户仪表盘",
      "description": "实现用户数据概览仪表盘...",
      "status": "in_progress",
      "priority": "high",
      "assignee_id": "agent-uuid",
      "assignee_name": "前端程序员",
      "parent_id": null,
      "project_id": null,
      "tags": ["前端", "仪表盘"],
      "due_at": "2026-07-01T00:00:00+08:00",
      "auto_assign": true,
      "max_depth": 3,
      "completion_behavior": "needs_review",
      "agent_loop_count": 0,
      "created_at": "2026-06-18T10:00:00+08:00",
      "updated_at": "2026-06-18T14:30:00+08:00"
    }
  ],
  "total": 45
}
```

**使用示例：**

```bash
# 获取所有进行中的高优先级任务
curl -G "https://www.coaether.cn/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "workspace_id=$WS_ID" \
  --data-urlencode "status=in_progress" \
  --data-urlencode "priority=high" \
  --data-urlencode "limit=10"

# 获取根任务（非子任务）
curl "https://www.coaether.cn/api/tasks?workspace_id=$WS_ID&parent_id=null" \
  -H "Authorization: Bearer $TOKEN"
```

---

## POST /api/tasks

创建新任务。如果设置了 `auto_assign = true`，系统会自动触发工作流。

**请求体：**

```json
{
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "开发用户仪表盘",
  "description": "实现一个用户数据概览仪表盘，包含以下指标：\n- 活跃用户数趋势图\n- 任务完成率\n- Token 消耗统计\n\n技术栈：React + TypeScript + ECharts",
  "priority": "high",
  "assignee_id": null,
  "parent_id": null,
  "project_id": null,
  "due_at": null,
  "auto_assign": true,
  "max_depth": 3,
  "max_agent_loops": 5,
  "completion_behavior": "needs_review",
  "token_budget": 50000,
  "tags": ["前端", "仪表盘"]
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `workspace_id` | uuid | 是 | — | 所属工作区 |
| `title` | string | 是 | — | 任务标题 |
| `description` | string | 否 | — | 详细描述，支持 Markdown |
| `priority` | enum | 否 | `medium` | `low` / `medium` / `high` |
| `assignee_id` | uuid | 否 | — | 指定智能体或用户，不指定则自动分配 |
| `parent_id` | uuid | 否 | — | 父任务 ID（创建子任务时） |
| `project_id` | uuid | 否 | — | 所属项目 |
| `due_at` | timestamp | 否 | — | 截止日期，ISO 8601 格式 |
| `auto_assign` | bool | 否 | `false` | 开启智能体自动分配和工作流 |
| `max_depth` | int | 否 | `5` | 子任务拆解最大层数 |
| `max_agent_loops` | int | 否 | `12` | 审核驳回后最大重试次数 |
| `completion_behavior` | string | 否 | `auto_done` | `auto_done` / `needs_review` / `manual` |
| `token_budget` | int | 否 | `100000` | 工作流 Token 预算 |
| `tags` | string[] | 否 | — | 标签列表 |

**成功响应（201）：**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "开发用户仪表盘",
  "status": "todo",
  "created_at": "2026-06-18T10:00:00+08:00"
}
```

**错误响应：**

| 状态码 | 错误信息 | 说明 |
|--------|---------|------|
| 400 | `title is required` | 缺少标题 |
| 400 | `workspace_id is required` | 缺少工作区 ID |
| 403 | `not a member of this workspace` | 无权限 |

---

## POST /api/tasks/batch

批量创建任务（最多 50 个）。

**请求体：**

```json
{
  "workspace_id": "550e8400-e29b-41d4-a716-446655440000",
  "tasks": [
    {"title": "任务 A", "description": "描述 A", "priority": "high"},
    {"title": "任务 B", "description": "描述 B", "priority": "medium"},
    {"title": "任务 C", "description": "描述 C"}
  ]
}
```

**响应（201）：**

```json
{
  "created": 3,
  "tasks": [
    {"id": "uuid-1", "title": "任务 A", "status": "todo"},
    {"id": "uuid-2", "title": "任务 B", "status": "todo"},
    {"id": "uuid-3", "title": "任务 C", "status": "todo"}
  ]
}
```

---

## GET /api/tasks/:id

获取任务详情，包含子任务、依赖关系和评论。

```bash
curl "https://www.coaether.cn/api/tasks/$TASK_ID?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**响应（200）：**

```json
{
  "id": "uuid",
  "title": "开发用户仪表盘",
  "description": "完整描述...",
  "status": "in_progress",
  "priority": "high",
  "assignee_id": "agent-uuid",
  "assignee_name": "前端程序员",
  "parent_id": null,
  "children": [
    {
      "id": "child-uuid-1",
      "title": "实现图表组件",
      "status": "done",
      "depends_on": [],
      "sort_order": 1
    },
    {
      "id": "child-uuid-2",
      "title": "实现数据接口",
      "status": "in_progress",
      "depends_on": [0],
      "sort_order": 2
    }
  ],
  "depends_on": [],
  "comments": [
    {
      "id": "comment-uuid",
      "author_name": "产品经理",
      "is_agent_comment": true,
      "content": "分析完成。该仪表盘需要...",
      "created_at": "2026-06-18T10:05:00+08:00"
    }
  ],
  "agent_loop_count": 1,
  "created_at": "2026-06-18T10:00:00+08:00",
  "updated_at": "2026-06-18T14:30:00+08:00"
}
```

| 字段 | 说明 |
|------|------|
| `children` | 子任务列表，含依赖关系和排序 |
| `comments` | 任务评论，包含智能体和用户的交流历史 |
| `agent_loop_count` | 审核驳回循环次数 |
| `depends_on` | 此任务依赖的前置任务 sort_order 列表 |

---

## PUT /api/tasks/:id

更新任务属性。支持部分更新。

```bash
curl -X PUT "https://www.coaether.cn/api/tasks/$TASK_ID?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "cancelled"}'
```

**可更新字段**：`title`、`description`、`status`、`priority`、`assignee_id`、`due_at`、`tags`

**状态流转规则：**

| 当前状态 | 可流转到 |
|---------|---------|
| `todo` | `in_progress`、`cancelled` |
| `in_progress` | `review`、`blocked`、`failed`、`cancelled` |
| `review` | `done`、`in_progress`（驳回返工） |
| `blocked` | `in_progress`、`cancelled` |

---

## DELETE /api/tasks/:id

删除任务（级联删除子任务）。

```bash
curl -X DELETE "https://www.coaether.cn/api/tasks/$TASK_ID?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**注意**：此操作会同时删除所有子任务，不可撤销。

---

## POST /api/tasks/:id/decompose

手动触发任务分解。任务需要 `auto_assign = true`。

```bash
curl -X POST "https://www.coaether.cn/api/tasks/$TASK_ID/decompose?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**响应（200）：**

```json
{
  "message": "decomposition triggered",
  "task_id": "uuid"
}
```

任务进入「任务委派专家」队列，分析完成后会生成分解计划并在评论中展示。

---

## GET /api/tasks/:id/comments

获取任务评论列表，按时间正序排列。

```bash
curl "https://www.coaether.cn/api/tasks/$TASK_ID/comments?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**响应（200）：**

```json
{
  "comments": [
    {
      "id": "comment-uuid",
      "task_id": "task-uuid",
      "author_id": "user-or-agent-uuid",
      "author_name": "产品经理",
      "is_agent_comment": true,
      "content": "分析完成。建议拆解为...",
      "created_at": "2026-06-18T10:05:00+08:00"
    }
  ],
  "total": 12
}
```

---

## POST /api/tasks/:id/comments

为任务添加评论。

```bash
curl -X POST "https://www.coaether.cn/api/tasks/$TASK_ID/comments?workspace_id=$WS_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "请补充错误处理的逻辑。",
    "is_agent_comment": false
  }'
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 是 | 评论内容，支持 Markdown |
| `is_agent_comment` | bool | 否 | 是否为智能体评论，默认 false |

**成功响应（201）：**

```json
{
  "id": "comment-uuid",
  "created_at": "2026-06-18T15:00:00+08:00"
}
```

---

## 任务状态流转图

```
创建 → todo → in_progress → review → done
           ↘               ↘
        cancelled      in_progress（驳回修改）
                           ↙
                      failed（异常终止）

todo / in_progress → blocked（依赖未满足）
           blocked → in_progress（依赖解除）
```
