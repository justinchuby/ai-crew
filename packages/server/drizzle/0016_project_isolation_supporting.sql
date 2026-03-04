ALTER TABLE file_locks ADD COLUMN project_id TEXT DEFAULT '';
--> statement-breakpoint
ALTER TABLE activity_log ADD COLUMN project_id TEXT DEFAULT '';
--> statement-breakpoint
ALTER TABLE collective_memory ADD COLUMN project_id TEXT DEFAULT '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_file_locks_project ON file_locks (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collective_memory_project ON collective_memory (project_id);
--> statement-breakpoint
DROP INDEX IF EXISTS idx_collective_memory_cat_key;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_collective_memory_cat_key ON collective_memory (category, key, project_id);
