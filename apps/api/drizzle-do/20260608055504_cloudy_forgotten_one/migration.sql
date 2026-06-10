CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `instances` (
	`labels_hash` text PRIMARY KEY NOT NULL,
	`labels` text NOT NULL,
	`state` text DEFAULT 'Normal' NOT NULL,
	`value` real,
	`pending_since` integer,
	`fired_at` integer,
	`resolved_at` integer,
	`last_eval_at` integer NOT NULL,
	`last_notified_at` integer
);
