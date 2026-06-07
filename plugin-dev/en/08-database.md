# Database & Storage

## Overview

Plugins have three data storage options, listed in order of recommendation:

| Method | Persistence | Use Case | Notes |
|--------|------------|----------|-------|
| **KV Store** | Memory only | Config, Tokens, Cache | Provided by host API, lost on restart |
| **SQLite File** | Persistent | Structured business data | Stored in plugin `data_dir` |
| **Database Migrations** | Persistent | Integration with host database | Execute SQL in data directory |

## 1. KV Store (Simple Key-Value)

Accessed via the [Host API](04-host-api.md) `__plugin_host/kv/*` endpoints.

```go
// Write
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

// Read
func kvGet(key string) ([]byte, error) {
    host := os.Getenv("COAETHER_HOST_ADDR")
    resp, err := http.Get(fmt.Sprintf("http://%s/__plugin_host/kv/%s", host, key))
    if err != nil { return nil, err }
    defer resp.Body.Close()
    if resp.StatusCode == 404 { return nil, nil }
    return io.ReadAll(resp.Body)
}

// Delete
func kvDelete(key string) error {
    host := os.Getenv("COAETHER_HOST_ADDR")
    req, _ := http.NewRequest("DELETE",
        fmt.Sprintf("http://%s/__plugin_host/kv/%s", host, key), nil)
    req.Header.Set("X-Plugin-Id", os.Getenv("COAETHER_PLUGIN_ID"))
    _, err := http.DefaultClient.Do(req)
    return err
}
```

**Characteristics:**
- No dependencies required
- Memory only, lost on restart
- Suitable for: storing temporary tokens, counters, runtime cache

## 2. SQLite (Recommended Persistent Storage)

Plugins create SQLite databases in their own `data_dir`.

```
data/
└── plugins/
    └── my-plugin/
        ├── data.db           ← SQLite database file
        ├── config.json       ← Plugin configuration
        └── uploads/          ← File storage
```

### Using SQLite in Go Plugins

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
    
    // Initialize table schema
    db.Exec(`CREATE TABLE IF NOT EXISTS widgets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)
}
```

**Note:** Using SQLite requires adding the `github.com/mattn/go-sqlite3` dependency in `go.mod`.

### Using bbolt (Embedded KV) in Go Plugins

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

## 3. Database Migrations

Plugins can place SQL files in the `migrations/` directory within `data_dir`, executed during `init`.

**File naming convention:** `{sequence}_{description}.sql`

```
data/
└── plugins/
    └── my-plugin/v1.0.0/
        └── migrations/
            ├── 001_create_widgets.sql
            └── 002_add_widget_color.sql
```

### Migration File Examples

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

### Migration Rules

1. Table names must be prefixed with `plugin_{name}_` to avoid conflicts with other plugins
2. Each migration file is executed only once, in ascending sequence order
3. Each file is executed in its own transaction
4. Migrations are idempotent (use `CREATE TABLE IF NOT EXISTS`)
5. Rollback is not supported

### Running Migrations in a Plugin

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

## 4. Extras Fields

To store plugin-specific data in core tables such as tasks or projects, use the `extras` JSON field.

### Writing

```
PUT /__plugin_host/tasks/{taskId}
Content-Type: application/json

{
  "extras": {
    "my-plugin": {
      "widget_id": "w123",
      "annotation": "This is a plugin annotation"
    }
  }
}
```

### Reading

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

### Conventions

1. Each plugin uses `extras.{plugin_name}` as its namespace
2. Do not read or modify other plugins' `extras` data
3. `extras` is a JSON field; the host does not validate its structure
4. `extras` is suitable for storing small amounts of additional data (< 10KB); for large amounts of data, use separate tables
