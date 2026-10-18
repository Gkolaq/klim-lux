CREATE TABLE `automation_backup` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`sha256` text NOT NULL,
	`encoding` text NOT NULL,
	`json_bytes` integer NOT NULL,
	`gzip_bytes` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_backup_chunks` (
	`ordinal` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `site_content` ADD `backup_sha256` text;