CREATE TABLE `multiplayer_cost_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`story_turn` real NOT NULL,
	`payer_account_id` text NOT NULL,
	`payer_display_name` text NOT NULL,
	`cause` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`input_tokens` real DEFAULT 0 NOT NULL,
	`cached_input_tokens` real DEFAULT 0 NOT NULL,
	`output_tokens` real DEFAULT 0 NOT NULL,
	`estimated_cost_usd` real DEFAULT 0 NOT NULL,
	`success` real DEFAULT 1 NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `multiplayer_cost_room_turn_idx` ON `multiplayer_cost_ledger` (`room_id`,`story_turn`);--> statement-breakpoint
CREATE INDEX `multiplayer_cost_payer_idx` ON `multiplayer_cost_ledger` (`payer_account_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `multiplayer_members` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`account_id` text NOT NULL,
	`owner_key` text NOT NULL,
	`display_name` text NOT NULL,
	`seat` real NOT NULL,
	`role` text DEFAULT 'PLAYER' NOT NULL,
	`status` text DEFAULT 'JOINED' NOT NULL,
	`api_key_ready` real DEFAULT 0 NOT NULL,
	`joined_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `multiplayer_members_room_seat_idx` ON `multiplayer_members` (`room_id`,`seat`);--> statement-breakpoint
CREATE INDEX `multiplayer_members_account_idx` ON `multiplayer_members` (`account_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `multiplayer_room_events` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`actor_account_id` text NOT NULL,
	`actor_display_name` text NOT NULL,
	`type` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `multiplayer_events_room_created_idx` ON `multiplayer_room_events` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `multiplayer_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`host_account_id` text NOT NULL,
	`host_owner_key` text NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text NOT NULL,
	`status` text DEFAULT 'WAITING' NOT NULL,
	`max_players` real DEFAULT 4 NOT NULL,
	`turn_limit_seconds` real DEFAULT 120 NOT NULL,
	`current_member_id` text,
	`turn_deadline_at` text,
	`key_recovery_deadline_at` text,
	`paused_reason` text DEFAULT '' NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`revision` real DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `multiplayer_rooms_code_unique` ON `multiplayer_rooms` (`code`);--> statement-breakpoint
CREATE INDEX `multiplayer_rooms_host_updated_idx` ON `multiplayer_rooms` (`host_account_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `multiplayer_rooms_session_idx` ON `multiplayer_rooms` (`session_id`);