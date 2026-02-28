CREATE TABLE `project_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`session_id` text,
	`task` text,
	`status` text DEFAULT 'active',
	`started_at` text DEFAULT (datetime('now')),
	`ended_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_project_sessions_project` ON `project_sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_sessions_lead` ON `project_sessions` (`lead_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`cwd` text,
	`status` text DEFAULT 'active',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_projects_status` ON `projects` (`status`);