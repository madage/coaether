import urllib.request, json
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InN1cGVyY29AcXEuY29tIiwidXNlcl9pZCI6ImRmZWE2YTVkLWRiMmMtNGY4OS1iNzY1LWY2ZGUzZTY4MTFhMiIsInVzZXJuYW1lIjoic3VwZXJjbyJ9.0WKdXWSX6lnfWt4hmvSgl8zrU8lS4bIw4JC8KJYtrGM"
req = urllib.request.Request(
    "http://localhost:8088/api/tasks/b245d1cc-aec6-487d-a9f1-22684704e705/comments?workspace_id=3bdac24c-ba95-4810-b49d-5f261313dfb4",
    headers={"Authorization": f"Bearer {token}"}
)
data = json.loads(urllib.request.urlopen(req).read().decode("utf-8"))
with open("E:/coaether/api_order.txt", "w", encoding="utf-8") as f:
    for c in data.get("comments", []):
        agent = " [AGENT]" if c.get("is_agent_comment") else ""
        f.write(f"[{c['created_at']}]{agent}: {c['content'][:80]}\n")
print("done")
