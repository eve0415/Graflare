CREATE UNIQUE INDEX `contact_points_org_name_idx` ON `contact_points` (`org_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `mute_timings_org_name_idx` ON `mute_timings` (`org_id`,`name`);