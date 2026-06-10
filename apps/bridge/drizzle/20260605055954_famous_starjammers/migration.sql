CREATE TABLE `dataset_status` (
	`dataset` text NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`retry_after` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dataset_status_pk` ON `dataset_status` (`dataset`,`scope`,`scope_id`);--> statement-breakpoint
DROP INDEX `metrics_pk`;--> statement-breakpoint
DROP INDEX `metrics_dataset_ts`;--> statement-breakpoint
ALTER TABLE `metrics` ADD `scope` text DEFAULT 'account' NOT NULL;--> statement-breakpoint
ALTER TABLE `metrics` ADD `scope_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `metrics` ADD `dims_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `metrics_pk` ON `metrics` (`ts`,`dataset`,`scope`,`scope_id`,`resource`,`metric_name`,`dims_hash`);--> statement-breakpoint
CREATE INDEX `metrics_dataset_ts` ON `metrics` (`scope`,`scope_id`,`dataset`,`ts`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sync_state` (
	`dataset` text NOT NULL,
	`scope` text DEFAULT 'account' NOT NULL,
	`scope_id` text DEFAULT '' NOT NULL,
	`last_sync_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sync_state`("dataset", "scope", "scope_id", "last_sync_at") SELECT "dataset", "scope", "scope_id", "last_sync_at" FROM `sync_state`;--> statement-breakpoint
DROP TABLE `sync_state`;--> statement-breakpoint
ALTER TABLE `__new_sync_state` RENAME TO `sync_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sync_state_pk` ON `sync_state` (`dataset`,`scope`,`scope_id`);