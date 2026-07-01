-- Migration 3: Create automation_scripts table
CREATE TABLE IF NOT EXISTS automation_scripts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    steps TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_automation_scripts_updated
    ON automation_scripts(updated_at DESC);
