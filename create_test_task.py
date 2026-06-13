import json, urllib.request, sys
sys.stdout.reconfigure(encoding="utf-8")

TOKEN = sys.argv[1]
WSID = sys.argv[2]
PROJECT_ID = sys.argv[3]
AGENT_ID = sys.argv[4]

# Create a simple task with agent assignment
data = {
    "title": "开发用户注册功能",
    "description": "实现用户注册功能，包括：\n1. 注册表单（用户名、邮箱、密码、确认密码）\n2. 表单验证（邮箱格式、密码强度）\n3. 后端注册 API\n4. 发送欢迎邮件\n\n请先提出分解计划，审核通过后逐步实现。",
    "project_id": PROJECT_ID,
    "assignee_id": AGENT_ID,
    "assignee_type": "agent_profile"
}

body = json.dumps(data, ensure_ascii=False).encode("utf-8")

req = urllib.request.Request(
    f"http://localhost:8088/api/tasks?workspace_id={WSID}",
    data=body,
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }
)
resp = urllib.request.urlopen(req)
result = json.loads(resp.read())
print(json.dumps(result, ensure_ascii=False, indent=2))

task_id = result.get("id")
print(f"\nTASK_ID={task_id}")
