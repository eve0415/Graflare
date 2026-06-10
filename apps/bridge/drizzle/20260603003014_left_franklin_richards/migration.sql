CREATE TABLE `metrics` (
	`ts` integer NOT NULL,
	`dataset` text NOT NULL,
	`resource` text NOT NULL,
	`metric_name` text NOT NULL,
	`value` real NOT NULL,
	`dims` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metrics_pk` ON `metrics` (`ts`,`dataset`,`resource`,`metric_name`);--> statement-breakpoint
CREATE INDEX `metrics_dataset_ts` ON `metrics` (`dataset`,`ts`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`dataset` text PRIMARY KEY NOT NULL,
	`last_sync_at` integer NOT NULL
);
