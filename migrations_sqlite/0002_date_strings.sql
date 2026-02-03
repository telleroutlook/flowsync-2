-- Convert task/project date fields from integer timestamps to YYYY-MM-DD strings
-- Projects
CREATE TABLE `projects__temp` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `icon` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

INSERT INTO `projects__temp` (
  id, workspace_id, name, description, icon, created_at, updated_at
)
SELECT
  id,
  workspace_id,
  name,
  description,
  icon,
  CASE
    WHEN typeof(created_at) = 'text' THEN created_at
    ELSE date(created_at / 1000, 'unixepoch')
  END,
  CASE
    WHEN typeof(updated_at) = 'text' THEN updated_at
    ELSE date(updated_at / 1000, 'unixepoch')
  END
FROM `projects`;

DROP TABLE `projects`;
ALTER TABLE `projects__temp` RENAME TO `projects`;

-- Tasks
CREATE TABLE `tasks__temp` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text NOT NULL,
  `priority` text NOT NULL,
  `wbs` text,
  `created_at` text NOT NULL,
  `start_date` text,
  `due_date` text,
  `completion` integer,
  `assignee` text,
  `is_milestone` integer DEFAULT false NOT NULL,
  `predecessors` text,
  `updated_at` text NOT NULL
);

INSERT INTO `tasks__temp` (
  id, project_id, title, description, status, priority, wbs,
  created_at, start_date, due_date, completion, assignee,
  is_milestone, predecessors, updated_at
)
SELECT
  id,
  project_id,
  title,
  description,
  status,
  priority,
  wbs,
  CASE
    WHEN typeof(created_at) = 'text' THEN created_at
    ELSE date(created_at / 1000, 'unixepoch')
  END,
  CASE
    WHEN start_date IS NULL THEN NULL
    WHEN typeof(start_date) = 'text' THEN start_date
    ELSE date(start_date / 1000, 'unixepoch')
  END,
  CASE
    WHEN due_date IS NULL THEN NULL
    WHEN typeof(due_date) = 'text' THEN due_date
    ELSE date(due_date / 1000, 'unixepoch')
  END,
  completion,
  assignee,
  is_milestone,
  predecessors,
  CASE
    WHEN typeof(updated_at) = 'text' THEN updated_at
    ELSE date(updated_at / 1000, 'unixepoch')
  END
FROM `tasks`;

DROP TABLE `tasks`;
ALTER TABLE `tasks__temp` RENAME TO `tasks`;
