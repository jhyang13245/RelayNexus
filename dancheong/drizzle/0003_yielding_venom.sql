CREATE TABLE `admin_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_account_id` text NOT NULL,
	`actor_display_name` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`detail_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_logs_created_idx` ON `admin_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_logs_actor_idx` ON `admin_audit_logs` (`actor_account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `relay_account_migrations` (
	`migration_key` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`detail_json` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relay_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email_key` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'USER' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relay_accounts_email_key_unique` ON `relay_accounts` (`email_key`);--> statement-breakpoint
CREATE INDEX `relay_accounts_role_idx` ON `relay_accounts` (`role`,`last_seen_at`);