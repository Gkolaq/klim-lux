CREATE TABLE `library_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `library_created_at_idx` ON `library_uploads` (`created_at`);