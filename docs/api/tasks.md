# 任务 API

## GET /api/tasks

获取工作区中的任务列表。

**查询参数：**
- `workspace_id` (required)
- `status` — 过滤状态
- `offset` / `limit` — 分页

## POST /api/tasks

创建新任务。

**请求体：**
```json
{
  "workspace_id": "uuid",
  "title": "任务标题",
  "description": "详细描述",
  "priority": "medium",
  "auto_assign": true,
  "max_depth": 5
}
```

## GET /api/tasks/:id

获取任务详情，包括子任务、依赖关系和评论。

## PUT /api/tasks/:id

更新任务属性（标题、描述、状态、指派人等）。

## GET /api/tasks/:id/comments

获取任务评论列表。

## POST /api/tasks/:id/comments

添加评论。

**请求体：**
```json
{
  "content": "评论内容",
  "is_agent_comment": false
}
```

## POST /api/tasks/:id/decompose

触发任务自动分解。需要任务设置 `auto_assign = true`。

## 任务状态流转

```
todo → in_progress → review → done
                ↓
             failed / cancelled
```
