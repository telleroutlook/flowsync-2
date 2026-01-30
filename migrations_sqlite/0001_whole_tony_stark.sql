CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`type` text NOT NULL,
	`timestamp` integer NOT NULL
);
