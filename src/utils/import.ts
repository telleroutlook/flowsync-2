/**
 * Import utilities for parsing files and creating draft actions
 */

import type { Project, Task, DraftAction } from '../../types';
import { generateId } from './id';
import {
  parseBoolean,
  parseNumeric,
  parseCompletion,
  normalizeStatus,
  normalizePriority,
} from './export';

export type ImportTask = Task & { projectName?: string };

// Result of parsing an import file
export interface ImportResult {
  projects: Project[];
  tasks: ImportTask[];
}

// Result of processing imports for draft creation
export interface ProcessedImport {
  projectActions: DraftAction[];
  taskActions: DraftAction[];
  projectCount: number;
  taskCount: number;
}

/**
 * Parse predecessors from various formats
 */
function parsePredecessors(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return undefined;
}

/**
 * Merge project metadata into existing project
 */
function mergeProjectMeta(target: Project, meta: Partial<Project>): void {
  if (meta.description !== undefined) target.description = meta.description;
  if (meta.icon !== undefined) target.icon = meta.icon;
  if (meta.createdAt !== undefined) target.createdAt = meta.createdAt;
  if (meta.updatedAt !== undefined) target.updatedAt = meta.updatedAt;
}

/**
 * Register or update a project in the import maps
 */
export function registerProject(
  project: Project,
  projectById: Map<string, Project>,
  projectByName: Map<string, Project>,
  importedProjects: Project[]
): Project {
  const nameKey = project.name.trim().toLowerCase();
  const existingById = projectById.get(project.id);
  const existingByName = nameKey ? projectByName.get(nameKey) : undefined;
  const target = existingById || existingByName;

  if (target) {
    if (project.name && project.name !== target.name) target.name = project.name;
    mergeProjectMeta(target, project);
    if (!target.id && project.id) {
      target.id = project.id;
      projectById.set(project.id, target);
    }
    return target;
  }

  importedProjects.push(project);
  projectById.set(project.id, project);
  if (nameKey) projectByName.set(nameKey, project);
  return project;
}

/**
 * Resolve or create a project from import data
 */
export function resolveProject(
  projectId: string | undefined,
  projectName: string | undefined,
  meta: Partial<Project>,
  activeProject: Project,
  projects: Project[],
  projectById: Map<string, Project>,
  projectByName: Map<string, Project>,
  importedProjects: Project[]
): Project {
  const name = projectName?.trim();

  // Return active project if no identifiers provided
  if (!projectId && !name) return activeProject;

  // Check existing workspace projects by name
  if (!projectId && name) {
    const existingWorkspace = projects.find((item) => item.name === name);
    if (existingWorkspace) {
      projectById.set(existingWorkspace.id, existingWorkspace);
      projectByName.set(name.toLowerCase(), existingWorkspace);
      return existingWorkspace;
    }
  }

  // Check import maps by ID
  if (projectId) {
    const existing = projectById.get(projectId);
    if (existing) {
      if (name) existing.name = name;
      mergeProjectMeta(existing, meta);
      return existing;
    }
  }

  // Check import maps by name
  if (name) {
    const existingByName = projectByName.get(name.toLowerCase());
    if (existingByName) {
      mergeProjectMeta(existingByName, meta);
      return existingByName;
    }
  }

  // Create new project
  return registerProject(
    {
      id: projectId || generateId(),
      name: name || activeProject.name,
      description: meta.description,
      icon: meta.icon,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    },
    projectById,
    projectByName,
    importedProjects
  );
}

/**
 * Parse a project record from import data
 */
export function parseProjectRecord(record: Record<string, unknown>): Project | null {
  const name = typeof record.name === 'string' ? record.name : '';
  if (!name) return null;

  return {
    id: typeof record.id === 'string' ? record.id : generateId(),
    name,
    description: typeof record.description === 'string' ? record.description : undefined,
    icon: typeof record.icon === 'string' ? record.icon : undefined,
    createdAt: parseNumeric(record.createdAt),
    updatedAt: parseNumeric(record.updatedAt),
  };
}

/**
 * Parse a task record from import data
 */
export function parseTaskRecord(
  record: Record<string, unknown>,
  resolveProjectFn: (projectId?: string, projectName?: string, meta?: Partial<Project>) => Project
): ImportTask {
  const projectName = typeof record.project === 'string' ? record.project : undefined;
  const projectId = typeof record.projectId === 'string' ? record.projectId : undefined;

  const project = resolveProjectFn(projectId, projectName, {
    description: typeof record.projectDescription === 'string' ? record.projectDescription : undefined,
    icon: typeof record.projectIcon === 'string' ? record.projectIcon : undefined,
    createdAt: parseNumeric(record.projectCreatedAt),
    updatedAt: parseNumeric(record.projectUpdatedAt),
  });

  return {
    id: typeof record.id === 'string' ? record.id : generateId(),
    projectId: project.id,
    projectName: project.name,
    title: typeof record.title === 'string' ? record.title : 'Untitled Task',
    description: typeof record.description === 'string' ? record.description : undefined,
    status: normalizeStatus(typeof record.status === 'string' ? record.status : undefined),
    priority: normalizePriority(typeof record.priority === 'string' ? record.priority : undefined),
    wbs: typeof record.wbs === 'string' ? record.wbs : undefined,
    createdAt: parseNumeric(record.createdAt) ?? Date.now(),
    updatedAt: parseNumeric(record.updatedAt),
    startDate: parseNumeric(record.startDate),
    dueDate: parseNumeric(record.dueDate),
    completion: parseCompletion(record.completion),
    assignee: typeof record.assignee === 'string' ? record.assignee : undefined,
    isMilestone:
      typeof record.isMilestone === 'boolean'
        ? record.isMilestone
        : parseBoolean(typeof record.isMilestone === 'string' ? record.isMilestone : undefined),
    predecessors: parsePredecessors(record.predecessors),
  };
}

/**
 * Parse CSV/TSV lowercase record with proper field mapping
 */
export function parseLowercaseRecord(record: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...record };

  // Map lowercase keys to expected keys
  const keyMap: Record<string, string> = {
    rowtype: 'rowType',
    projectid: 'projectId',
    projectdescription: 'projectDescription',
    projecticon: 'projectIcon',
    projectcreatedat: 'projectCreatedAt',
    projectupdatedat: 'projectUpdatedAt',
    ismilestone: 'isMilestone',
    createdat: 'createdAt',
    updatedat: 'updatedAt',
    startdate: 'startDate',
    duedate: 'dueDate',
  };

  for (const [lowerKey, correctKey] of Object.entries(keyMap)) {
    if (lowerKey in record && !(correctKey in result)) {
      result[correctKey] = record[lowerKey];
    }
  }

  return result;
}

/**
 * Process imported projects and tasks into draft actions
 */
export async function processImportActions(
  importedProjects: Project[],
  importedTasks: ImportTask[],
  importStrategy: 'append' | 'merge',
  activeProject: Project,
  apiService: {
    listProjects(): Promise<Project[]>;
  },
  fetchAllTasks: () => Promise<Task[]>
): Promise<ProcessedImport> {
  const projectList = await apiService.listProjects();
  const projectById = new Map(projectList.map((project) => [project.id, project]));
  const projectByName = new Map(projectList.map((project) => [project.name, project]));
  const projectIdMap = new Map<string, string>();
  const projectCreateActions: DraftAction[] = [];
  const projectUpdateActions: DraftAction[] = [];

  // Process projects
  for (const project of importedProjects) {
    const existingById = project.id ? projectById.get(project.id) : undefined;
    const existingByName = projectByName.get(project.name);

    if (existingById) {
      projectIdMap.set(project.id, existingById.id);
      if (importStrategy === 'merge') {
        const shouldUpdateName = project.name && project.name !== existingById.name;
        const shouldUpdateDescription = project.description !== undefined && project.description !== existingById.description;
        const shouldUpdateIcon = project.icon !== undefined && project.icon !== existingById.icon;
        const shouldUpdateCreatedAt = project.createdAt !== undefined && project.createdAt !== existingById.createdAt;
        const shouldUpdateUpdatedAt = project.updatedAt !== undefined && project.updatedAt !== existingById.updatedAt;
        if (shouldUpdateName || shouldUpdateDescription || shouldUpdateIcon || shouldUpdateCreatedAt || shouldUpdateUpdatedAt) {
          const after: Record<string, unknown> = { name: project.name };
          if (project.description !== undefined) after.description = project.description;
          if (project.icon !== undefined) after.icon = project.icon;
          if (project.createdAt !== undefined) after.createdAt = project.createdAt;
          if (project.updatedAt !== undefined) after.updatedAt = project.updatedAt;
          projectUpdateActions.push({
            id: generateId(),
            entityType: 'project',
            action: 'update',
            entityId: existingById.id,
            after,
          });
        }
      }
      continue;
    }

    if (existingByName) {
      projectIdMap.set(project.id, existingByName.id);
      continue;
    }

    projectIdMap.set(project.id, project.id);
    projectById.set(project.id, project);
    if (!projectByName.has(project.name)) {
      projectByName.set(project.name, project);
    }
    projectCreateActions.push({
      id: generateId(),
      entityType: 'project',
      action: 'create',
      after: {
        id: project.id,
        name: project.name,
        description: project.description,
        icon: project.icon,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    });
  }

  const projectActions = [...projectCreateActions, ...projectUpdateActions];

  // Process tasks
  let taskActions: DraftAction[] = [];
  let taskCount = 0;

  if (importedTasks.length > 0) {
    const existingTasks = await fetchAllTasks();
    const existingTaskIds = new Set(existingTasks.map((item) => item.id));

    const usedIds = new Set(existingTaskIds);
    const taskIdMap = new Map<string, string>();

    // Normalize task IDs for append mode
    const normalizedTasks = importedTasks.map((task) => {
      const originalId = task.id;
      let finalId = originalId;
      if (importStrategy === 'append' && usedIds.has(finalId)) {
        do {
          finalId = generateId();
        } while (usedIds.has(finalId));
      }
      taskIdMap.set(originalId, finalId);
      usedIds.add(finalId);
      return { ...task, id: finalId };
    });

    // Remap predecessors
    const remappedTasks = normalizedTasks.map((task) => ({
      ...task,
      predecessors: task.predecessors?.map((pred) => taskIdMap.get(pred) ?? pred),
    }));

    // Resolve project IDs
    const resolvedTasks = remappedTasks.map((task) => {
      const mappedProjectId = projectIdMap.get(task.projectId);
      let projectId =
        mappedProjectId || (task.projectId && projectById.has(task.projectId) ? task.projectId : undefined);
      if (!projectId && task.projectName) {
        const byName = projectByName.get(task.projectName);
        if (byName) projectId = byName.id;
      }
      if (!projectId) projectId = activeProject.id;
      return { ...task, projectId };
    });

    // Create task actions
    taskActions = resolvedTasks.map((task) => {
      // Validate projectId
      if (!task.projectId) {
        console.error('[Import] Task missing projectId after resolution:', task);
        throw new Error('Import failed: Task data is incomplete. Please ensure all tasks have a valid project association.');
      }

      const shouldUpdate = importStrategy === 'merge' && existingTaskIds.has(task.id);
      const afterPayload: Record<string, unknown> = {
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        wbs: task.wbs,
        startDate: task.startDate,
        dueDate: task.dueDate,
        completion: task.completion,
        assignee: task.assignee,
        isMilestone: task.isMilestone,
        predecessors: task.predecessors,
      };
      if (!shouldUpdate) {
        afterPayload.id = task.id;
        afterPayload.createdAt = task.createdAt;
        afterPayload.updatedAt = task.updatedAt;
      }
      return {
        id: generateId(),
        entityType: 'task',
        action: shouldUpdate ? 'update' : 'create',
        entityId: shouldUpdate ? task.id : undefined,
        after: afterPayload,
      };
    });
    taskCount = resolvedTasks.length;
  }

  return {
    projectActions,
    taskActions,
    projectCount: projectCreateActions.length + projectUpdateActions.length,
    taskCount,
  };
}
