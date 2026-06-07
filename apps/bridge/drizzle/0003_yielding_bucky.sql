CREATE TABLE `schema_cache` (
	`node_name` text NOT NULL,
	`scope` text NOT NULL,
	`type_name` text NOT NULL,
	`schema_json` text NOT NULL,
	`last_checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schema_cache_pk` ON `schema_cache` (`node_name`,`scope`);