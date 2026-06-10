CREATE TABLE `discovery_cache` (
	`node_name` text NOT NULL,
	`scope` text NOT NULL,
	`is_available` integer NOT NULL,
	`max_page_size` integer DEFAULT 0 NOT NULL,
	`not_older_than` integer DEFAULT 0 NOT NULL,
	`last_checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_cache_pk` ON `discovery_cache` (`node_name`,`scope`);