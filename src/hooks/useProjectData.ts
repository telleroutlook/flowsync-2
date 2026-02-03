import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiService } from '../../services/apiService';
import { storageGet, storageSet } from '../utils/storage';
import { Project, Task } from '../../types';
import { useI18n } from '../i18n';
import { config } from '../../shared/config';

// Pagination and cache configuration - centralized in shared/config.ts
const { defaultPageSize: PAGE_SIZE } = config.pagination;
const { ttlMs: PROJECT_CACHE_TTL_MS, maxSize: MAX_CACHE_SIZE } = config.cache.project;

const getProjectStorageKey = (workspaceId: string): string =>
  workspaceId ? `activeProjectId:${workspaceId}` : 'activeProjectId';

// In-memory cache for projects with workspace isolation
const projectCacheByWorkspace = new Map<string, { data: Project[]; timestamp: number }>();

const getProjectCache = (workspaceId: string): { data: Project[]; timestamp: number } | null =>
  projectCacheByWorkspace.get(workspaceId) || null;

const setProjectCache = (workspaceId: string, data: Project[]): void => {
  // Prevent unbounded cache growth by evicting oldest entry when limit is reached
  if (projectCacheByWorkspace.size >= MAX_CACHE_SIZE) {
    const firstKey = projectCacheByWorkspace.keys().next().value;
    if (firstKey) {
      projectCacheByWorkspace.delete(firstKey);
    }
  }
  projectCacheByWorkspace.set(workspaceId, { data, timestamp: Date.now() });
};

const invalidateProjectCache = (workspaceId?: string): void => {
  if (workspaceId) {
    projectCacheByWorkspace.delete(workspaceId);
  } else {
    projectCacheByWorkspace.clear();
  }
};

export const useProjectData = (workspaceId: string) => {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const activeProjectIdRef = useRef<string>('');

  const fallbackProject = useMemo(() => ({ id: '', name: t('project.none'), description: '' }), [t]);

  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || projects[0] || fallbackProject;
  }, [projects, activeProjectId, fallbackProject]);

  const activeTasks = useMemo(() => {
    if (!activeProjectId) return [];
    return tasks.filter(task => task.projectId === activeProjectId);
  }, [tasks, activeProjectId]);

  const fetchAllTasks = useCallback(async (projectId?: string) => {
    const collected: Task[] = [];
    let page = 1;
    let total = 0;
    try {
      do {
        const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
        if (projectId) params.projectId = projectId;
        const result = await apiService.listTasks(params);
        collected.push(...result.data);
        total = result.total;
        page += 1;
      } while (collected.length < total);
      return collected;
    } catch (err) {
      throw err;
    }
  }, []);

  const refreshData = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      setError(null);

      // Use cache if available and not force refreshing
      let projectList: Project[];
      const cached = getProjectCache(workspaceId);
      if (!forceRefresh && cached && (Date.now() - cached.timestamp) < PROJECT_CACHE_TTL_MS) {
        projectList = cached.data;
      } else {
        projectList = await apiService.listProjects();
        setProjectCache(workspaceId, projectList);
      }

      if (!isMountedRef.current) return;

      setProjects(projectList);

      const storageKey = getProjectStorageKey(workspaceId);
      const stored = storageGet(storageKey);
      const candidate = stored && projectList.find(project => project.id === stored) ? stored : activeProjectIdRef.current;
      const finalId = candidate && projectList.find(project => project.id === candidate)
          ? candidate
          : projectList[0]?.id || '';

      setActiveProjectId(finalId);
      activeProjectIdRef.current = finalId;

      const taskList = await fetchAllTasks(finalId);
      if (!isMountedRef.current) return;
      setTasks(taskList);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : t('error.load_data'));
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fetchAllTasks, t, workspaceId]);

  const handleSelectProject = useCallback(async (id: string) => {
    setActiveProjectId(id);
    activeProjectIdRef.current = id;
    const storageKey = getProjectStorageKey(workspaceId);
    storageSet(storageKey, id);
    try {
      setIsLoadingTasks(true);
      const newTasks = await fetchAllTasks(id);
      if (!isMountedRef.current) return;
      setTasks(newTasks);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(t('error.load_project_tasks'));
    } finally {
      if (isMountedRef.current) {
        setIsLoadingTasks(false);
      }
    }
  }, [fetchAllTasks, t, workspaceId]);

  useEffect(() => {
    isMountedRef.current = true;
    refreshData();

    return () => {
      isMountedRef.current = false;
    };
  }, [refreshData, workspaceId]);

  useEffect(() => {
    if (activeProjectId) {
      const storageKey = getProjectStorageKey(workspaceId);
      storageSet(storageKey, activeProjectId);
    }
  }, [activeProjectId, workspaceId]);

  return {
    projects,
    tasks,
    setTasks,
    activeProjectId,
    activeProject,
    activeTasks,
    isLoading,
    isLoadingTasks,
    error,
    refreshData,
    handleSelectProject,
    fetchAllTasks,
    invalidateCache: useCallback(() => invalidateProjectCache(workspaceId), [workspaceId])
  };
};
