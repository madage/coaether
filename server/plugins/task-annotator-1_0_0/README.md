# Task Annotator 插件

完整的 CoAether 插件示例，展示真实插件的开发模式。

## 演示的功能

| 功能 | 文件 | 说明 |
|------|------|------|
| 插件清单 | `plugin.json` | 完整的能力和权限声明 |
| SQLite 存储 | `main.go` | 在 data_dir 中创建独立数据库 |
| 钩子响应 | `main.go` | 监听 task:created 自动创建标注占位 |
| 业务 API | `main.go` | CRUD 标注 REST API |
| 主机 API | `main.go:callHost()` | 插件回调主程序查询数据 |
| 前端组件 | `frontend/` | 任务详情标签页展示标注编辑 UI |
| 数据库迁移 | `migrations/` | SQL 迁移文件 |

## 文件结构

```
task-annotator-1_0_0/
├── plugin.json              # 插件清单
├── task-annotator           # 编译后二进制
├── migrations/
│   └── 001_create_annotations.sql
└── frontend/
    └── dist/
        ├── index.js
        └── style.css
```

## API 端点

插件注册在 `/api/plugins/task-annotator/` 下：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/annotations?task_id=xxx` | GET | 查询任务的标注 |
| `/annotations` | POST | 创建/更新标注 |
| `/annotations/{id}` | DELETE | 删除标注 |

请求示例：

```bash
# 创建/更新标注
curl -X POST http://localhost:8080/api/plugins/task-annotator/annotations \
  -H "Content-Type: application/json" \
  -d '{"task_id": "xxx", "content": "需要关注", "color": "#f44336"}'

# 查询标注
curl http://localhost:8080/api/plugins/task-annotator/annotations?task_id=xxx
```

## 安装

```bash
# 构建
cd task-annotator
go build -o task-annotator .

mkdir -p /path/to/coaether/plugins/task-annotator-1_0_0/
cp task-annotator plugin.json /path/to/coaether/plugins/task-annotator-1_0_0/
cp -r migrations /path/to/coaether/plugins/task-annotator-1_0_0/

# 构建前端
cd frontend
npm install && npm run build
cp -r dist /path/to/coaether/plugins/task-annotator-1_0_0/frontend/

# 重启主程序
```
