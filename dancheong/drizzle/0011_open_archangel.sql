ALTER TABLE `cortex_session_leases` ADD `takeover_client_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cortex_session_leases` ADD `takeover_requested_at` text DEFAULT '' NOT NULL;