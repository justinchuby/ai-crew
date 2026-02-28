CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`agent_role` text NOT NULL,
	`action_type` text NOT NULL,
	`summary` text NOT NULL,
	`details` text DEFAULT '{}',
	`timestamp` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_activity_agent` ON `activity_log` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_type` ON `activity_log` (`action_type`);--> statement-breakpoint
CREATE TABLE `agent_memory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_agent_memory_lead` ON `agent_memory` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_memory_agent` ON `agent_memory` (`agent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_memory_unique` ON `agent_memory` (`lead_id`,`agent_id`,`key`);--> statement-breakpoint
CREATE TABLE `chat_group_members` (
	`group_name` text NOT NULL,
	`lead_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`added_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`group_name`, `lead_id`, `agent_id`)
);
--> statement-breakpoint
CREATE TABLE `chat_group_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`group_name` text NOT NULL,
	`lead_id` text NOT NULL,
	`from_agent_id` text NOT NULL,
	`from_role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_group_messages_group` ON `chat_group_messages` (`group_name`,`lead_id`);--> statement-breakpoint
CREATE TABLE `chat_groups` (
	`name` text NOT NULL,
	`lead_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`name`, `lead_id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`task_id` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_agent` ON `conversations` (`agent_id`);--> statement-breakpoint
CREATE TABLE `dag_tasks` (
	`id` text NOT NULL,
	`lead_id` text NOT NULL,
	`role` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`files` text DEFAULT '[]',
	`depends_on` text DEFAULT '[]',
	`dag_status` text DEFAULT 'pending',
	`priority` integer DEFAULT 0,
	`model` text,
	`assigned_agent_id` text,
	`created_at` text DEFAULT (datetime('now')),
	`completed_at` text,
	PRIMARY KEY(`id`, `lead_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_dag_tasks_lead` ON `dag_tasks` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_dag_tasks_status` ON `dag_tasks` (`dag_status`);--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`agent_role` text NOT NULL,
	`lead_id` text,
	`title` text NOT NULL,
	`rationale` text DEFAULT '',
	`needs_confirmation` integer DEFAULT 0,
	`status` text DEFAULT 'recorded',
	`confirmed_at` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_decisions_status` ON `decisions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_decisions_needs_confirmation` ON `decisions` (`needs_confirmation`);--> statement-breakpoint
CREATE INDEX `idx_decisions_lead_id` ON `decisions` (`lead_id`);--> statement-breakpoint
CREATE TABLE `file_locks` (
	`file_path` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`agent_role` text NOT NULL,
	`reason` text DEFAULT '',
	`acquired_at` text DEFAULT (datetime('now')),
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_file_locks_agent` ON `file_locks` (`agent_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`sender` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` text DEFAULT (datetime('now')),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`system_prompt` text DEFAULT '',
	`color` text DEFAULT '#888',
	`icon` text DEFAULT '🤖',
	`built_in` integer DEFAULT 0,
	`model` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
