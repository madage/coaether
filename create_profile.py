import json, urllib.request
import sys

TOKEN = sys.argv[1]
WSID = sys.argv[2]
NODE_ID = sys.argv[3]

data = json.dumps({
    "name": "架构师",
    "agent_id": "claude",
    "node_id": NODE_ID,
    "description": "系统架构师智能体，负责任务分解和架构设计",
    "capabilities": ["propose_decomposition_plan", "task.write", "task.read"],
    "enabled": True
}).encode("utf-8")

req = urllib.request.Request(
    f"http://localhost:8088/api/agents/profiles?workspace_id={WSID}",
    data=data,
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }
)
resp = urllib.request.urlopen(req)
result = json.loads(resp.read())
print(json.dumps(result, ensure_ascii=False))
