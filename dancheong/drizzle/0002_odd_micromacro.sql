CREATE TABLE IF NOT EXISTS `cost_meter_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`app_version` text NOT NULL,
	`telemetry_json` text NOT NULL,
	`recorded_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cost_meter_turns_owner_recorded_idx` ON `cost_meter_turns` (`owner_key`,`recorded_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cost_meter_turns_session_idx` ON `cost_meter_turns` (`session_id`);
