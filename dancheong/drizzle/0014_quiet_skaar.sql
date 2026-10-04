CREATE TABLE `multiplayer_cortex_live` (
	`room_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`seq` integer NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text NOT NULL
);
