CREATE TABLE `chart_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`actor` text NOT NULL,
	`reason` text,
	`timestamp` integer NOT NULL,
	`project_id` text,
	`draft_id` text
);
--> statement-breakpoint
CREATE TABLE `chart_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`data_source_id` text,
	`title` text NOT NULL,
	`description` text,
	`chart_type` text NOT NULL,
	`echarts_config` text NOT NULL,
	`validation_status` text NOT NULL,
	`validation_errors` text,
	`generated_by` text NOT NULL,
	`generation_prompt` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chart_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`draft_type` text NOT NULL,
	`actions` text NOT NULL,
	`generated_by` text NOT NULL,
	`prompt` text,
	`created_at` integer NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE TABLE `chart_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chart_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`thumbnail` text,
	`echarts_template` text NOT NULL,
	`sample_data` text,
	`tags` text,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`content` text,
	`r2_key` text,
	`parse_status` text NOT NULL,
	`parse_errors` text,
	`uploaded_at` integer NOT NULL,
	`uploaded_by` text NOT NULL
);
