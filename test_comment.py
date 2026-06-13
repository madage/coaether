# -*- coding: utf-8 -*-
import urllib.request
import json

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InN1cGVyY29AcXEuY29tIiwidXNlcl9pZCI6ImRmZWE2YTVkLWRiMmMtNGY4OS1iNzY1LWY2ZGUzZTY4MTFhMiIsInVzZXJuYW1lIjoic3VwZXJjbyJ9.0WKdXWSX6lnfWt4hmvSgl8zrU8lS4bIw4JC8KJYtrGM"

# Test 1: Create comment with @前端程序员 (proper UTF-8)
data = {"content": "@前端程序员 帮我看看这个任务"}
body = json.dumps(data, ensure_ascii=False).encode('utf-8')

url = "http://localhost:8088/api/tasks/c852baf9-d98c-48cb-b8c5-f9a7bb22b071/comments?workspace_id=3bdac24c-ba95-4810-b49d-5f261313dfb4"
req = urllib.request.Request(url, data=body, method='POST')
req.add_header('Content-Type', 'application/json; charset=utf-8')
req.add_header('Authorization', f'Bearer {token}')

try:
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read().decode('utf-8'))
    print("Comment created:")
    print(json.dumps(result, indent=2, ensure_ascii=False))
except urllib.error.HTTPError as e:
    print(f"Error: {e.code}")
    print(e.read().decode('utf-8'))

# Test 2: Check if @mention triggered any agent queue entries
req2 = urllib.request.Request(
    "http://localhost:8088/api/agents/queue?workspace_id=3bdac24c-ba95-4810-b49d-5f261313dfb4",
    headers={'Authorization': f'Bearer {token}'}
)
resp2 = urllib.request.urlopen(req2)
queue = json.loads(resp2.read().decode('utf-8'))
print("\nAgent queue:")
print(json.dumps(queue, indent=2, ensure_ascii=False, default=str))
