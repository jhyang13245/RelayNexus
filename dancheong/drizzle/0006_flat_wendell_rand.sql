CREATE TABLE `live_reliability_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text NOT NULL,
	`app_version` text NOT NULL,
	`telemetry_json` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `live_reliability_owner_recorded_idx` ON `live_reliability_attempts` (`owner_key`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `live_reliability_session_idx` ON `live_reliability_attempts` (`session_id`,`recorded_at`);