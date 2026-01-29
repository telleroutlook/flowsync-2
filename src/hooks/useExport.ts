import { useState, useEffect, useCallback } from 'react';
import { Project, Task, DraftAction, Draft } from '../../types';
import { apiService } from '../../services/apiService';
import {
  generateId,
  storageGet,
  storageSet,
  parseDelimitedContent,
  buildDisplayRows,
  buildExportRows,
  triggerDownload,
  makeSafeFileName,
  formatCsvValue,
  EXPORT_HEADERS,
  DISPLAY_HEADERS,
  // Import utilities
  parseProjectRecord,
  parseTaskRecord,
  resolveProject,
  registerProject,
  processImportActions,
  parseLowercaseRecord,
  type ImportResult,
  type ProcessedImport,
  type ImportTask,
} from '../utils';
import { useI18n } from '../i18n';

export type ExportFormat = 'csv' | 'tsv' | 'json' | 'markdown';
export type ImportStrategy = 'append' | 'merge';

interface UseExportProps {
  projects: Project[];
  activeProject: Project;
  activeTasks: Task[];
  refreshData: () => Promise<void>;
  submitDraft: (actions: DraftAction[], options: { createdBy: Draft['createdBy']; autoApply?: boolean; reason?: string; silent?: boolean }) => Promise<any>;
  fetchAllTasks: () => Promise<Task[]>;
  onError?: (message: string) => void;
  onShowMessage?: (message: string) => void;
}

export const useExport = ({
  projects,
  activeProject,
  activeTasks,
  refreshData,
  submitDraft,
  fetchAllTasks,
  onError,
  onShowMessage
}: UseExportProps) => {
  const { t } = useI18n();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [lastExportFormat, setLastExportFormat] = useState<ExportFormat>('csv');
  const [importStrategy, setImportStrategy] = useState<ImportStrategy>('append');

  // Helper to show error messages
  const showError = useCallback((message: string) => {
    if (onError) {
      onError(message);
    } else {
      // Fallback to console if no error handler provided
      console.error('[useExport]', message);
    }
  }, [onError]);

  // Helper to show info messages
  const showMessage = useCallback((message: string) => {
    if (onShowMessage) {
      onShowMessage(message);
    }
  }, [onShowMessage]);

  useEffect(() => {
    const storedFormat = storageGet('exportFormat');
    const storedImportStrategy = storageGet('importStrategy');
    if (storedFormat === 'csv' || storedFormat === 'tsv' || storedFormat === 'json' || storedFormat === 'markdown') {
      setLastExportFormat(storedFormat);
    }
    if (storedImportStrategy === 'append' || storedImportStrategy === 'merge') {
      setImportStrategy(storedImportStrategy);
    }
  }, []);

  const recordExportPreference = useCallback((format: ExportFormat) => {
    setLastExportFormat(format);
    storageSet('exportFormat', format);
  }, []);

  const recordImportPreference = useCallback((strategy: ImportStrategy) => {
    setImportStrategy(strategy);
    storageSet('importStrategy', strategy);
  }, []);

  const buildDisplayRowsCallback = useCallback((sourceTasks: Task[], exportProjects: Project[]) => {
    return buildDisplayRows(sourceTasks, exportProjects, activeProject);
  }, [activeProject]);

  const buildExportRowsCallback = useCallback((sourceTasks: Task[], exportProjects: Project[]) => {
    return buildExportRows(sourceTasks, exportProjects, activeProject);
  }, [activeProject]);

  const handleExportTasks = useCallback(async (format: ExportFormat) => {
    try {
      const exportDate = new Date();
      const fileStamp = exportDate.toISOString().slice(0, 10);
      const baseName = `${makeSafeFileName(activeProject.name)}-tasks-${fileStamp}`;
      const exportProjects = [activeProject];
      const sourceTasks = activeTasks;
      const rows = buildExportRowsCallback(sourceTasks, exportProjects);
      const displayRows = buildDisplayRowsCallback(sourceTasks, exportProjects);

      if (format === 'json') {
        const payload = {
          version: 2,
          scope: 'project',
          exportedAt: exportDate.toISOString(),
          projects: exportProjects,
          tasks: sourceTasks,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        triggerDownload(blob, `${baseName}.json`);
        recordExportPreference(format);
        return;
      }


      if (format === 'markdown') {
        const payload = {
          scope: 'project',
          exportedAt: exportDate.toISOString(),
        };
        const headers = [...DISPLAY_HEADERS];
        const escapeMd = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
        const body = displayRows.map(row => [
          row.project,
          row.id,
          row.title,
          row.status,
          row.priority,
          row.assignee,
          row.wbs,
          row.startDate,
          row.dueDate,
          String(row.completion),
          row.isMilestone,
          row.predecessors,
          row.description,
          row.createdAt,
        ].map(cell => escapeMd(String(cell))).join(' | '));

        const markdown = [
          t('export.markdown.title_project', { project: activeProject.name }),
          '',
          t('export.markdown.exported_at', { date: payload.exportedAt }),
          '',
          `| ${headers.join(' | ')} |`,
          `| ${headers.map(() => '---').join(' | ')} |`,
          ...body.map(line => `| ${line} |`),
          '',
        ].join('\n');

        const blob = new Blob([markdown], { type: 'text/markdown' });
        triggerDownload(blob, `${baseName}.md`);
        recordExportPreference(format);
        return;
      }

      const delimiter = format === 'tsv' ? '\t' : ',';
      const headers = [...EXPORT_HEADERS];
      const lines = [
        headers.join(delimiter),
        ...rows.map(row => headers
          .map(header => formatCsvValue(String((row as Record<string, unknown>)[header] ?? ''), delimiter))
          .join(delimiter)),
      ];

      const mime = format === 'tsv' ? 'text/tab-separated-values' : 'text/csv';
      const blob = new Blob([lines.join('\n')], { type: `${mime};charset=utf-8;` });
      triggerDownload(blob, `${baseName}.${format}`);
      recordExportPreference(format);
    } catch (error) {
      console.error('Failed to export tasks:', error);
      showError(t('app.error.generic') || 'Export failed');
    }
  }, [activeProject, activeTasks, buildExportRowsCallback, buildDisplayRowsCallback, recordExportPreference, t, showError]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ format?: ExportFormat }>).detail;
      const format = detail?.format ?? lastExportFormat;
      void handleExportTasks(format);
    };
    window.addEventListener('flowsync:export', handler);
    window.flowsyncExportReady = true;
    return () => {
      window.removeEventListener('flowsync:export', handler);
      if (window.flowsyncExportReady) {
        delete window.flowsyncExportReady;
      }
    };
  }, [handleExportTasks, lastExportFormat]);

  // Parse import file and extract projects/tasks
  const parseImportFile = useCallback(
    (content: string, fileName: string): ImportResult | null => {
      const lowerName = fileName.toLowerCase();
      let importedProjects: Project[] = [];
      let importedTasks: ImportTask[] = [];
      const projectById = new Map<string, Project>();
      const projectByName = new Map<string, Project>();

      const resolveProjectFn = (projectId?: string, projectName?: string, meta?: Partial<Project>) =>
        resolveProject(projectId, projectName, meta, activeProject, projects, projectById, projectByName, importedProjects);

      // Parse JSON format
      if (lowerName.endsWith('.json')) {
        try {
          const payload = JSON.parse(content) as Record<string, unknown>;
          if (payload.version !== 2) {
            showError(t('import.failed_invalid_version'));
            return null;
          }
          if (!Array.isArray(payload.projects) || !Array.isArray(payload.tasks)) {
            showError(t('import.failed_invalid_format'));
            return null;
          }
          for (const raw of payload.projects as Record<string, unknown>[]) {
            if (!raw || typeof raw !== 'object') continue;
            const project = parseProjectRecord(raw);
            if (project) registerProject(project, projectById, projectByName, importedProjects);
          }
          for (const raw of payload.tasks as Record<string, unknown>[]) {
            if (!raw || typeof raw !== 'object') continue;
            const task = parseTaskRecord(raw, resolveProjectFn);
            importedTasks.push(task);
          }
        } catch {
          showError(t('import.failed_invalid_json'));
          return null;
        }
      }
      // Parse CSV/TSV format
      else if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
        const { headers, records } = parseDelimitedContent(content);
        const requiredHeaders = EXPORT_HEADERS.map((header) => header.toLowerCase());
        const headerSet = new Set(headers);
        const hasRequiredHeaders = requiredHeaders.every((header) => headerSet.has(header));
        if (!hasRequiredHeaders) {
          const missing = requiredHeaders.filter((header) => !headerSet.has(header));
          showError(t('import.failed_missing_headers', { headers: missing.join(', ') }));
          return null;
        }

        for (const record of records) {
          const normalizedRecord = parseLowercaseRecord(record);
          const rowType = (normalizedRecord.rowType as string | undefined)?.toLowerCase();
          if (rowType !== 'project' && rowType !== 'task') {
            showError(t('import.failed_invalid_rowtype'));
            return null;
          }

          if (rowType === 'project') {
            const project = parseProjectRecord(normalizedRecord);
            if (project) registerProject(project, projectById, projectByName, importedProjects);
            continue;
          }

          importedTasks.push(parseTaskRecord(normalizedRecord, resolveProjectFn));
        }
      } else {
        showError(t('import.failed_invalid_format'));
        return null;
      }

      if (importedTasks.length === 0 && importedProjects.length === 0) {
        showError(t('import.no_tasks'));
        return null;
      }

      return { projects: importedProjects, tasks: importedTasks };
    },
    [activeProject, projects, t, showError]
  );

  // Process import and submit drafts
  const runImport = useCallback(
    async (importResult: ImportResult) => {
      const { projectActions, taskActions, projectCount, taskCount } = await processImportActions(
        importResult.projects,
        importResult.tasks,
        importStrategy,
        activeProject,
        { listProjects: () => apiService.listProjects() },
        fetchAllTasks
      );

      if (projectActions.length > 0) {
        await submitDraft(projectActions, { createdBy: 'user', autoApply: true, reason: 'Import projects', silent: true });
      }

      if (taskActions.length > 0) {
        await submitDraft(taskActions, { createdBy: 'user', autoApply: true, reason: 'Import tasks', silent: true });
      }

      if (projectActions.length > 0 || taskActions.length > 0) {
        await refreshData();
        showMessage(
          importStrategy === 'merge'
            ? t('import.success_summary_merged', { projectCount, taskCount })
            : t('import.success_summary_imported', { projectCount, taskCount })
        );
      }
    },
    [importStrategy, activeProject, fetchAllTasks, submitDraft, refreshData, t, showMessage]
  );

  const handleImportFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result || '');
        const importResult = parseImportFile(content, file.name);
        if (importResult) {
          void runImport(importResult);
        }
      };
      reader.readAsText(file);
    },
    [parseImportFile, runImport]
  );

  return {
    isExportOpen,
    setIsExportOpen,
    lastExportFormat,
    importStrategy,
    recordImportPreference,
    handleExportTasks,
    handleImportFile
  };
};
