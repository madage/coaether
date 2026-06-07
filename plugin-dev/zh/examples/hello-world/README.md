# Hello World 插件

最小 CoAether 插件示例，演示了最基础的插件实现。

## 文件

| 文件 | 说明 |
|------|------|
| `plugin.json` | 插件清单 |
| `main.go` | 插件主程序 |
| `go.mod` | Go 模块定义 |

## 构建与安装

```bash
# 构建
cd hello-world
go build -o hello-world .

# 安装到主程序 plugins 目录
mkdir -p /path/to/coaether/plugins/hello-world-1_0_0/
cp hello-world plugin.json /path/to/coaether/plugins/hello-world-1_0_0/

# 重启主程序
```

## 验证

```bash
curl http://localhost:8080/api/plugins/hello-world/hello
# → {"message":"Hello from CoAether plugin!", "plugin_id":"hello-world", "uptime_ms":1234}

curl http://localhost:8080/api/plugins/hello-world/projects
# → {"projects":[...]}
```

## 演示的功能

| 功能 | 说明 |
|------|------|
| 生命周期 | Init、Health、Shutdown |
| 业务 API | `/hello` 返回问候信息 |
| 主机 API 调用 | `/projects` 调用主程序查询项目列表 |
| 日志 | 标准输出自动被主程序捕获 |
