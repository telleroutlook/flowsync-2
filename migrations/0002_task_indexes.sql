-- Add indexes to speed up task list and count queries
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks (project_id);
CREATE INDEX IF NOT EXISTS projects_workspace_id_idx ON projects (workspace_id);
