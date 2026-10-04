CREATE TABLE `session_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`session_id` text NOT NULL,
	`project_id` text NOT NULL,
	`revision` real NOT NULL,
	`kind` text DEFAULT 'AUTO' NOT NULL,
	`label` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`turn` real DEFAULT 0 NOT NULL,
	`source_device_id` text DEFAULT 'unknown' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `session_checkpoints_session_created_idx` ON `session_checkpoints` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `session_checkpoints_owner_created_idx` ON `session_checkpoints` (`owner_key`,`created_at`);--> statement-breakpoint
ALTER TABLE `scenario_projects` ADD `project_revision` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenario_projects` ADD `package_fingerprint` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD `revision` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD `project_revision` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD `package_fingerprint` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD `last_writer_id` text DEFAULT 'unknown' NOT NULL;