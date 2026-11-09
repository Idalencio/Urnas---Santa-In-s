CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`election_id` text NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_time` ON `admin_audit` (`occurred_at`,`id`);--> statement-breakpoint
CREATE INDEX `audit_election` ON `admin_audit` (`election_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_actor` ON `admin_audit` (`actor_id`,`occurred_at`);