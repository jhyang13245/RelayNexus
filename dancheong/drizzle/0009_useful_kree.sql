CREATE TABLE `cortex_cloud_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`project_id` text NOT NULL,
	`source_project_id` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`snapshot_r2_key` text,
	`snapshot_sha256` text,
	`snapshot_byte_length` real,
	`turn` real DEFAULT 0 NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`preview` text DEFAULT '아직 시작하지 않은 이야기' NOT NULL,
	`revision` real DEFAULT 1 NOT NULL,
	`last_writer_id` text DEFAULT 'unknown' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cortex_cloud_sessions_owner_updated_idx` ON `cortex_cloud_sessions` (`owner_key`,`updated_at`);--> statement-breakpoint
CREATE INDEX `cortex_cloud_sessions_project_idx` ON `cortex_cloud_sessions` (`project_id`);