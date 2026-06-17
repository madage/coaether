---
name: deploy
description: "Deploy coaether + adminCoa to production server (8.148.182.204). Use when the user says \"deploy\", \"deploy to server\", \"push to production\", or similar."
---

# Deploy to Production

Deploy coaether (main) and adminCoa to the production server.

## Quick deploy (both projects)

```bash
bash scripts/deploy.sh
```

## Deploy only one project

```bash
bash scripts/deploy.sh --main-only     # coaether main only
bash scripts/deploy.sh --admin-only    # adminCoa only
```

## Skip rebuild (upload already-built artifacts)

```bash
bash scripts/deploy.sh --no-build
```

## What the script does

1. Cross-compiles Go backends for Linux (CGO_ENABLED=0)
2. Builds frontend static files (npm run build)
3. Stops systemd services on server
4. Uploads binaries via SSH pipe, frontends via tar+SSH pipe
5. Starts systemd services
6. Health-checks both endpoints

## Pre-requisites on local machine

- Go toolchain, Node.js/npm
- SSH key configured for root@8.148.182.204
- Scripts directory: `scripts/deploy.sh` + `scripts/deploy.conf`

## Server architecture after deploy

| Domain | Port | Service |
|--------|------|---------|
| www.coaether.cn | 80 → 8088 | coaether (main) |
| admin.coaether.cn | 80 → 8089 | coaether-admin |

## If deploy fails

1. Check server logs: `ssh root@8.148.182.204 "cat /opt/coaether/server.log | tail -20"`
2. Check admin logs: `ssh root@8.148.182.204 "cat /opt/coaether/admin/server.log | tail -20"`
3. Check service status: `ssh root@8.148.182.204 "systemctl status coaether coaether-admin"`
4. Run deploy again — it's idempotent
