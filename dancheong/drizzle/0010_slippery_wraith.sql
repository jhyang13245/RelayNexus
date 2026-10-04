CREATE TABLE `cortex_session_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`device_id` text DEFAULT 'unknown' NOT NULL,
	`client_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cortex_session_leases_owner_expiry_idx` ON `cortex_session_leases` (`owner_key`,`expires_at`);
