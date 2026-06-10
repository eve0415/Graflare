CREATE TABLE `access_service_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`cf_token_id` text NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `access_service_tokens_org_idx` ON `access_service_tokens` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_service_tokens_client_idx` ON `access_service_tokens` (`client_id`);