# 用量统计

用量统计模块帮助管理员了解平台的资源消耗。

## 查看用量

在「用量」页面，可以按工作区查看 Token 消耗：

| 指标 | 说明 |
|------|------|
| `prompt_tokens` | 输入 Token 总量 |
| `completion_tokens` | 输出 Token 总量 |
| `total_tokens` | Token 消耗总计 |
| `task_count` | 关联的任务数量 |

数据按 `total_tokens` 降序排列，消耗最多的工作区排在最前面。

## 数据来源

Token 用量数据来自 `token_usage` 表，每个智能体执行任务时会记录：

- 所属工作流
- 任务 ID
- 智能体 ID
- 会话 ID
- Token 消耗明细（prompt / completion / total）
- 执行阶段（work / review）

## 监控建议

- 定期检查用量趋势，及时发现异常消耗
- 对于已删除的工作区，显示为 `(deleted)` 但历史数据仍保留
- 用量数据可用于成本分析和资源规划
