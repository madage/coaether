# 数据库与存储

## 总览

插件有三种数据存储方式，按推荐优先级排列：

| 方式 | 持久性 | 适用场景 | 说明 |
|------|--------|---------|------|
| **KV 存储** | 仅内存 | 配置、Token、缓存 | 主机 API 提供，重启丢失 |
| **SQLite 文件** | 持久 | 结构化业务数据 | 存储在插件 `data_dir` |
| **数据库迁移** | 持久 | 与主程序数据库集成 | 在数据目录中执行 SQL |

## 1. KV 存储（简单键值）

通过 [主机 API](04-host-api.md) 的 `__plugin_host/kv/*` 端点访问。

```go
// 写入
func kvSet(key string, value []byte) error {
    host := os.Getenv("COAETHER_HOST_ADDR")
    pluginID := os.Getenv("COAETHER_PLUGIN_ID")
    
    req, _ := http.NewRequest("POST",
        fmt.Sprintf("http://%s/__plugin_host/kv/%s", host, key),
        bytes.NewReader(value))
    req.Header.Set("X-Plugin-Id", pluginID)
    
    resp, err := http.DefaultClient.Do(req)
    return err
}

// 读取
func kvGet(key string) ([]byte, error) {
    host := os.Getenv("COAETHER_HOST_ADDR")
    resp, err := http.Get(fmt.Sprintf("http://%s/__plugin_host/kv/%s", host, key))
    if err != nil { return nil, err }
    defer resp.Body.Close()
    if resp.StatusCode == 404 { return nil, nil }
    return io.ReadAll(resp.Body)
}

// 删除
func kvDelete(key string) error {
    host := os.Getenv("COAETHER_HOST_ADDR")
    req, _ := http.NewRequest("DELETE",
        fmt.Sprintf("http://%s/__plugin_host/kv/%s", host, key), nil)
    req.Header.Set("X-Plugin-Id", os.Getenv("COAETHER_PLUGIN_ID"))
    _, err := http.DefaultClient.Do(req)
    return err
}
```

**特点：**
- 不需要任何依赖
- 仅内存，重启丢失
- 适合：存储临时 Token、计数器、运行时缓存

## 2. SQLite（推荐持久化方式）

插件在自己的 `data_dir` 中创建 SQLite 数据库。

```
data/
└── plugins/
    └── my-plugin/
        ├── data.db           ← SQLite 数据库文件
        ├── config.json       ← 插件配置
        └── uploads/          ← 文件存储
```

### Go 插件中使用 SQLite

```go
package main

import (
    "database/sql"
    "os"
    _ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

func initDatabase() {
    dataDir := os.Getenv("COAETHER_DATA_DIR")
    dbPath := dataDir + "/data.db"
    
    var err error
    db, err = sql.Open("sqlite3", dbPath)
    if err != nil {
        log.Fatalf("Failed to open DB: %v", err)
    }
    
    // 初始化表结构
    db.Exec(`CREATE TABLE IF NOT EXISTS widgets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)
}
```

**注意：** 使用 SQLite 需要在 `go.mod` 中添加 `github.com/mattn/go-sqlite3` 依赖。

### Go 插件中使用 bbolt（嵌入式 KV）

```go
import "go.etcd.io/bbolt"

var boltDB *bbolt.DB

func initBolt() {
    dataDir := os.Getenv("COAETHER_DATA_DIR")
    var err error
    boltDB, err = bbolt.Open(dataDir+"/data.db", 0600, nil)
    if err != nil {
        log.Fatalf("Failed to open bolt: %v", err)
    }
    
    boltDB.Update(func(tx *bbolt.Tx) error {
        _, err := tx.CreateBucketIfNotExists([]byte("widgets"))
        return err
    })
}
```

## 3. 数据库迁移

插件可以在 `data_dir` 的 `migrations/` 目录中放置 SQL 文件，在 `init` 阶段执行。

**文件命名规则：** `{序号}_{描述}.sql`

```
data/
└── plugins/
    └── my-plugin/v1.0.0/
        └── migrations/
            ├── 001_create_widgets.sql
            └── 002_add_widget_color.sql
```

### 迁移文件示例

```sql
-- 001_create_widgets.sql
CREATE TABLE IF NOT EXISTS plugin_my_widgets (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    data        TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plugin_my_widgets_project
    ON plugin_my_widgets(project_id);
```

```sql
-- 002_add_widget_color.sql
ALTER TABLE plugin_my_widgets ADD COLUMN color TEXT DEFAULT '#1976d2';
```

### 迁移规则

1. 表名必须以 `plugin_{name}_` 为前缀，避免与其他插件冲突
2. 每个迁移文件仅执行一次，按序号升序执行
3. 每个文件在单独事务中执行
4. 迁移是幂等的（使用 `CREATE TABLE IF NOT EXISTS`）
5. 不支持回滚

### 插件内执行迁移

```go
func runMigrations() {
    dataDir := os.Getenv("COAETHER_DATA_DIR")
    migDir := filepath.Join(dataDir, "migrations")
    
    files, _ := filepath.Glob(filepath.Join(migDir, "*.sql"))
    sort.Strings(files)
    
    for _, f := range files {
        sqlBytes, _ := os.ReadFile(f)
        _, err := db.Exec(string(sqlBytes))
        if err != nil {
            log.Printf("Migration %s failed: %v", f, err)
        }
    }
}
```

## 4. 扩展字段（extras）

如需在任务或项目等核心表中存储插件专属数据，使用 `extras` JSON 字段。

### 写入

```
PUT /__plugin_host/tasks/{taskId}
Content-Type: application/json

{
  "extras": {
    "my-plugin": {
      "widget_id": "w123",
      "annotation": "这是插件的注释"
    }
  }
}
```

### 读取

```json
{
  "tasks": [{
    "id": "...",
    "title": "...",
    "extras": {
      "my-plugin": {
        "widget_id": "w123"
      }
    }
  }]
}
```

### 约定

1. 每个插件使用 `extras.{plugin_name}` 作为命名空间
2. 不读取或修改其他插件的 `extras` 数据
3. `extras` 是 JSON 字段，主程序不验证其结构
4. `extras` 适合存少量附加数据（< 10KB），大量数据请用独立表
