CREATE TABLE `vn_cloud_slots` (
	`owner` text NOT NULL,
	`slot` text NOT NULL,
	`revision` text NOT NULL,
	`mutation` text NOT NULL,
	`object_key` text NOT NULL,
	`previous_key` text,
	`summary` text NOT NULL,
	`bytes` integer NOT NULL,
	`checksum` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `slot`)
);

--> statement-breakpoint
CREATE TABLE `vn_cloud_objects` (
	`owner` text NOT NULL,
	`digest` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `digest`)
);
