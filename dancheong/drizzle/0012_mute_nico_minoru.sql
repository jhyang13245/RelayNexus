CREATE TABLE `multiplayer_chat_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`account_id` text NOT NULL,
	`client_id` text NOT NULL,
	`display_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `multiplayer_chat_room_seq_idx` ON `multiplayer_chat_messages` (`room_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `multiplayer_chat_sender_nonce_idx` ON `multiplayer_chat_messages` (`room_id`,`account_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `multiplayer_cortex_state` (
	`room_id` text PRIMARY KEY NOT NULL,
	`snapshot_json` text NOT NULL,
	`snapshot_r2_key` text,
	`snapshot_sha256` text,
	`snapshot_byte_length` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`turn` integer DEFAULT 0 NOT NULL,
	`claim_token` text,
	`claim_account_id` text,
	`claim_expires_at` text,
	`claim_room_revision` integer,
	`claim_cause` text,
	`last_commit_token` text,
	`updated_at` text NOT NULL
);
