CREATE TABLE `multiplayer_vn_playback` (
	`room_id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`payload_json` text NOT NULL
);
