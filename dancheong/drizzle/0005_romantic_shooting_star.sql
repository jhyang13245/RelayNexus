CREATE TABLE `cost_meter_backfill_state` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `scenario_projects` ADD `pack_r2_key` text;--> statement-breakpoint
ALTER TABLE `scenario_projects` ADD `pack_sha256` text;--> statement-breakpoint
ALTER TABLE `scenario_projects` ADD `pack_byte_length` real;--> statement-breakpoint
ALTER TABLE `session_checkpoints` ADD `snapshot_r2_key` text;--> statement-breakpoint
ALTER TABLE `session_checkpoints` ADD `snapshot_sha256` text;--> statement-breakpoint
ALTER TABLE `session_checkpoints` ADD `snapshot_byte_length` real;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD `snapshot_r2_key` text;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD `snapshot_sha256` text;--> statement-breakpoint
ALTER TABLE `simulation_sessions` ADD `snapshot_byte_length` real;