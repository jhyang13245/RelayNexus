CREATE TABLE `multiplayer_visual_assets` (
	`room_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`token` text NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`object_key` text,
	`bytes` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`room_id`, `key`)
);
