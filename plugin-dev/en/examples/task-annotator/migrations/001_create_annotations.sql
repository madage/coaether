-- Task Annotator plugin: initial schema
-- This file is executed during plugin initialization.

CREATE TABLE IF NOT EXISTS plugin_task_annotator_annotations (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#ffeb3b',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plugin_annotations_task
    ON plugin_task_annotator_annotations(task_id);
