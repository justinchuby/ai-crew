CREATE TABLE `agent_plans` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`plan_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT (datetime('now'))
);
