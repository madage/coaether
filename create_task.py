import json, urllib.request, sys

TOKEN = sys.argv[1]
WSID = sys.argv[2]
PROJECT_ID = sys.argv[3]
AGENT_PROFILE_ID = sys.argv[4] if len(sys.argv) > 4 else ""

data = {
    "title": "开发用户登录模块",
    "description": "需要开发用户登录功能，包括：\n1. 登录表单设计\n2. JWT Token 签发\n3. 会话管理\n4. 登录页面 UI\n\n请智能体先提出分解计划，审核通过后逐步实现。",
    "project_id": PROJECT_ID,
}
if AGENT_PROFILE_ID:
    data["assignee_id"] = AGENT_PROFILE_ID
    data["assignee_type"] = "agent_profile"

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
print(json.dumps(result, ensure_ascii=False))
