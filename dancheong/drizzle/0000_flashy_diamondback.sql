CREATE TABLE `scenario_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`source_project_id` text NOT NULL,
	`title` text NOT NULL,
	`genre` text DEFAULT '' NOT NULL,
	`player_name` text DEFAULT '' NOT NULL,
	`package_version` text DEFAULT 'unknown' NOT NULL,
	`pack_json` text NOT NULL,
	`r2_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scenario_projects_owner_updated_idx` ON `scenario_projects` (`owner_key`,`updated_at`);--> statement-breakpoint
CREATE TABLE `simulation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner_key` text NOT NULL,
	`name` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`turn` real DEFAULT 0 NOT NULL,
	`day` real DEFAULT 0 NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`preview` text DEFAULT '아직 시작하지 않은 이야기' NOT NULL,
	`total_cost_usd` real DEFAULT 0 NOT NULL,
	`last_mode` text DEFAULT 'mock' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_played_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `simulation_sessions_owner_played_idx` ON `simulation_sessions` (`owner_key`,`last_played_at`);--> statement-breakpoint
CREATE INDEX `simulation_sessions_project_idx` ON `simulation_sessions` (`project_id`);