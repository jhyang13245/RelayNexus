CREATE TABLE `package_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`r2_key` text NOT NULL,
	`r2_upload_id` text NOT NULL,
	`original_name` text NOT NULL,
	`size_bytes` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `package_uploads_owner_created_idx` ON `package_uploads` (`owner_key`,`created_at`);