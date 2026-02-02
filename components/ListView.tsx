import React, { useMemo, memo, useCallback } from 'react';
import { Task, TaskStatus } from '../types';
import { useI18n } from '../src/i18n';
import { getPriorityLabel, getStatusLabel } from '../src/i18n/labels';
import { cn } from '../src/utils/cn';
import { getTasksWithConflicts } from '../src/utils/task';
import { AlertTriangle, Inbox, Loader2, Calendar } from 'lucide-react';
import { PRIORITY_COLORS, STATUS_COLORS } from '../shared/constants/colors';
import { Badge } from './ui/Badge';
import { EmptyState } from './ui/EmptyState';
import { PRIORITY_ICONS } from '../shared/constants/icons';

interface ListViewProps {
  tasks: Task[];
  selectedTaskId?: string | null;
  onSelectTask?: (id: string) => void;
  loading?: boolean;
  zoom?: number;
  isMobile?: boolean;
}

interface TaskRowProps {
  task: Task;
  isSelected: boolean;
  onSelectTask?: (id: string) => void;
  hasConflict?: boolean;
}

const TaskCardMobile = memo(({ task, isSelected, onSelectTask, hasConflict }: TaskRowProps) => {
  const { t, locale } = useI18n();
  const handleClick = useCallback(() => {
    onSelectTask?.(task.id);
  }, [onSelectTask, task.id]);

  return (
    <div
      onClick={handleClick}
      className={cn(
        "p-3 border-b border-border-subtle bg-surface cursor-pointer transition-colors",
        isSelected ? "bg-primary/5" : "hover:bg-background"
      )}
    >
      {/* Title and Status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {hasConflict && <AlertTriangle className="w-4 h-4 text-negative shrink-0" aria-label={t('task.schedule_conflict')} />}
            {task.wbs && <span className="text-[10px] font-mono text-text-secondary">[{task.wbs}]</span>}
          </div>
          <p className="text-sm font-medium text-text-primary break-words">{task.title}</p>
          {task.description && (
            <p className="text-xs text-text-secondary truncate mt-0.5">{task.description}</p>
          )}
        </div>
        <span className={cn("text-xs px-2 py-1 rounded shrink-0", STATUS_COLORS[task.status])}>
          {getStatusLabel(task.status, t)}
        </span>
      </div>

      {/* Assignee, Priority, Due Date */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary mb-2">
        {task.assignee && (
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px]">
              {task.assignee.charAt(0).toUpperCase()}
            </div>
            <span className="truncate max-w-[80px]">{task.assignee}</span>
          </div>
        )}
        <Badge variant="outline" className={PRIORITY_COLORS[task.priority]}>
          {getPriorityLabel(task.priority, t)}
        </Badge>
        {task.dueDate && (
          <span className={cn(
            "flex items-center gap-1",
            task.dueDate < Date.now() && task.status !== TaskStatus.DONE && "text-negative"
          )}>
            <Calendar className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs text-text-secondary mb-1">
          <span>{t('kanban.progress')}</span>
          <span>{task.completion || 0}%</span>
        </div>
        <div className="w-full bg-background h-1 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full", task.completion === 100 ? "bg-success" : "bg-primary")}
            style={{ width: `${task.completion || 0}%` }}
            aria-label={`${task.completion || 0}% complete`}
          />
        </div>
      </div>
    </div>
  );
});
TaskCardMobile.displayName = 'TaskCardMobile';

const TaskRow = memo(({ task, isSelected, onSelectTask, hasConflict }: TaskRowProps) => {
  const { t, locale } = useI18n();
  const handleClick = useCallback(() => {
    onSelectTask?.(task.id);
  }, [onSelectTask, task.id]);

  return (
    <tr
      onClick={handleClick}
      aria-selected={isSelected}
      className={cn(
        "transition-colors group border-b border-border-subtle last:border-0",
        onSelectTask ? "cursor-pointer" : "",
        isSelected ? "bg-primary/5" : "hover:bg-background"
      )}
    >
      <td className="py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-mono text-text-secondary">{task.wbs || '-'}</td>
      <td className="py-2 sm:py-3 px-2 sm:px-4">
         <div className="flex flex-col">
            <span className={cn(
              "text-sm font-medium flex items-center gap-1.5",
              task.isMilestone ? "text-critical" : "text-text-primary"
            )}>
               {hasConflict && (
                 <AlertTriangle className="w-4 h-4 text-negative shrink-0" aria-label={t('task.schedule_conflict')} />
               )}
               {task.isMilestone && (
                 <svg className="w-4 h-4 text-critical" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" /></svg>
               )}
               {task.title}
            </span>
            {task.description && (
               <span className="text-xs text-text-secondary truncate max-w-[150px] sm:max-w-[200px] mt-0.5">{task.description}</span>
            )}
         </div>
      </td>
      <td className="hidden sm:table-cell py-3 px-4">
         {task.assignee ? (
           <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-secondary/10 text-secondary flex items-center justify-center text-xs font-bold border border-secondary/20">
                 {task.assignee.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-text-primary truncate max-w-[100px]">{task.assignee}</span>
           </div>
         ) : (
            <span className="text-xs text-text-secondary/50 italic">{t('task.unassigned')}</span>
         )}
      </td>
      <td className="hidden md:table-cell py-3 px-4">
         <Badge
           variant="outline"
           className={PRIORITY_COLORS[task.priority]}
           icon={PRIORITY_ICONS[task.priority]}
         >
            {getPriorityLabel(task.priority, t)}
         </Badge>
      </td>
      <td className="py-2 sm:py-3 px-2 sm:px-4">
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md", STATUS_COLORS[task.status])}>
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              task.status === TaskStatus.TODO ? "bg-text-secondary" :
              task.status === TaskStatus.IN_PROGRESS ? "bg-primary" : "bg-success"
            )} aria-hidden="true" />
            {getStatusLabel(task.status, t)}
        </span>
      </td>
      <td className="hidden sm:table-cell py-3 px-4">
         <div className="flex items-center gap-3 w-full max-w-[140px]">
            <div className="flex-1 bg-secondary/10 h-1.5 rounded-full overflow-hidden">
               <div
                 className={cn("h-full rounded-full transition-all duration-500", task.completion === 100 ? "bg-success" : "bg-primary")}
                 style={{ width: `${task.completion || 0}%`}}
                 aria-label={`${task.completion || 0}% complete`}
               />
            </div>
            <span className="text-xs w-8 text-right text-text-secondary font-mono">{task.completion || 0}%</span>
         </div>
      </td>
      <td className="hidden lg:table-cell py-3 px-4 text-xs text-text-secondary">
         {task.startDate ? new Date(task.startDate).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : '-'}
      </td>
      <td className="hidden lg:table-cell py-3 px-4 text-xs text-text-secondary font-medium">
         {task.dueDate ? (
           <span className={task.dueDate < Date.now() && task.status !== TaskStatus.DONE ? 'text-negative' : ''}>
              {new Date(task.dueDate).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
           </span>
         ) : '-'}
      </td>
    </tr>
  );
});
TaskRow.displayName = 'TaskRow';

export const ListView: React.FC<ListViewProps> = memo(({ tasks, selectedTaskId, onSelectTask, loading = false, zoom = 1, isMobile = false }) => {
  const { t } = useI18n();

  // Calculate tasks with conflicts for visual indicator
  const tasksWithConflicts = useMemo(() => getTasksWithConflicts(tasks), [tasks]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.wbs && b.wbs) return a.wbs.localeCompare(b.wbs, undefined, { numeric: true });
      return a.createdAt - b.createdAt;
    });
  }, [tasks]);

  // Loading state
  if (loading) {
    return (
      <div className="w-full h-full overflow-hidden bg-surface border border-border-subtle rounded-xl shadow-sm flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
            <p className="text-sm text-text-secondary font-medium">{t('app.loading.project_data')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden bg-surface border border-border-subtle rounded-xl shadow-sm flex flex-col">
       <div className="overflow-auto custom-scrollbar flex-1 min-h-0">
        <div className="min-w-full">
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              width: zoom !== 1 ? `${100 / zoom}%` : '100%'
            }}
          >
          <table className="w-full text-left border-collapse">
          <thead className="bg-background sticky top-0 z-10 border-b border-border-subtle">
            <tr>
              <th className="py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-text-secondary uppercase tracking-wider w-12 sm:w-16">{t('list.header.wbs')}</th>
              <th className="py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-text-secondary uppercase tracking-wider min-w-[180px] sm:min-w-[240px]">{t('list.header.task_name')}</th>
              <th className="hidden sm:table-cell py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-40">{t('list.header.assignee')}</th>
              <th className="hidden md:table-cell py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-28">{t('list.header.priority')}</th>
              <th className="py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-text-secondary uppercase tracking-wider w-24 sm:w-32">{t('list.header.status')}</th>
              <th className="hidden sm:table-cell py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-40">{t('list.header.progress')}</th>
              <th className="hidden lg:table-cell py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-28">{t('list.header.start')}</th>
              <th className="hidden lg:table-cell py-3 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-28">{t('list.header.due')}</th>
            </tr>
          </thead>
          <tbody className={cn("divide-y divide-border-subtle", isMobile && "hidden")}>
            {sortedTasks.length === 0 ? (
               <tr>
                 <td colSpan={8} className="py-16 text-center">
                    <EmptyState
                      icon={Inbox}
                      title={t('list.empty')}
                      variant="minimal"
                      className="py-16"
                    />
                 </td>
               </tr>
            ) : (
              sortedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isSelected={selectedTaskId === task.id}
                  onSelectTask={onSelectTask}
                  hasConflict={tasksWithConflicts.has(task.id)}
                />
              ))
            )}
          </tbody>
          {/* Mobile Card Layout */}
          {isMobile && (
            <div className="divide-y divide-border-subtle">
              {sortedTasks.length === 0 ? (
                <div className="py-16 text-center">
                  <EmptyState
                    icon={Inbox}
                    title={t('list.empty')}
                    variant="minimal"
                    className="py-16"
                  />
                </div>
              ) : (
                sortedTasks.map((task) => (
                  <TaskCardMobile
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onSelectTask={onSelectTask}
                    hasConflict={tasksWithConflicts.has(task.id)}
                  />
                ))
              )}
            </div>
          )}
        </table>
          </div>
        </div>
       </div>
    </div>
  );
});
ListView.displayName = 'ListView';
