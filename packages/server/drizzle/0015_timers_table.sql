CREATE TABLE `timers` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`agent_role` text NOT NULL,
	`lead_id` text,
	`label` text NOT NULL,
	`message` text NOT NULL,
	`delay_seconds` integer NOT NULL,
	`fire_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`status` text NOT NULL DEFAULT 'pending',
	`repeat` integer DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_timers_agent` ON `timers` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `idx_timers_status` ON `timers` (`status`);
