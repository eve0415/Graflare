CREATE TABLE `alert_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`labels_hash` text NOT NULL,
	`labels` text DEFAULT '{}' NOT NULL,
	`state` text DEFAULT 'Normal' NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`active_at` integer,
	`last_eval_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_instances_rule_labels_idx` ON `alert_instances` (`rule_id`,`labels_hash`);--> statement-breakpoint
CREATE TABLE `alert_rule_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`folder_id` text,
	`name` text NOT NULL,
	`eval_interval_s` integer DEFAULT 60 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_rule_groups_org_folder_name_idx` ON `alert_rule_groups` (`org_id`,`folder_id`,`name`);--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`group_id` text NOT NULL,
	`title` text NOT NULL,
	`queries` text DEFAULT '[]' NOT NULL,
	`condition` text NOT NULL,
	`labels` text DEFAULT '{}' NOT NULL,
	`annotations` text DEFAULT '{}' NOT NULL,
	`for_duration_s` integer DEFAULT 0 NOT NULL,
	`no_data_state` text DEFAULT 'Alerting' NOT NULL,
	`exec_err_state` text DEFAULT 'Alerting' NOT NULL,
	`is_paused` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `alert_rule_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_rules_org_group_title_idx` ON `alert_rules` (`org_id`,`group_id`,`title`);--> statement-breakpoint
CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`dashboard_id` text,
	`panel_id` text,
	`alert_rule_id` text,
	`time` integer NOT NULL,
	`time_end` integer,
	`text` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`prev_state` text,
	`new_state` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`alert_rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `annotations_org_dashboard_idx` ON `annotations` (`org_id`,`dashboard_id`);--> statement-breakpoint
CREATE INDEX `annotations_org_rule_idx` ON `annotations` (`org_id`,`alert_rule_id`);--> statement-breakpoint
CREATE TABLE `contact_points` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mute_timings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`intervals` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`parent_id` text,
	`contact_point_id` text,
	`group_by` text DEFAULT '["alertname"]' NOT NULL,
	`matchers` text DEFAULT '[]' NOT NULL,
	`mute_timing_ids` text DEFAULT '[]' NOT NULL,
	`group_wait_s` integer DEFAULT 30 NOT NULL,
	`group_interval_s` integer DEFAULT 300 NOT NULL,
	`repeat_interval_s` integer DEFAULT 14400 NOT NULL,
	`continue_matching` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_point_id`) REFERENCES `contact_points`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `silences` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`matchers` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `silences_org_ends_idx` ON `silences` (`org_id`,`ends_at`);