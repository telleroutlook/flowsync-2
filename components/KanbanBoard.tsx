import React, { useMemo, memo, useCallback } from 'react';
import { Task, TaskStatus } from '../types';
import { useI18n } from '../src/i18n';
import { getPriorityShortLabel, getStatusLabel } from '../src/i18n/labels';
import { cn } from '../src/utils/cn';
import { getTasksWithConflicts } from '../src/utils/task';
import { ClipboardList, Calendar, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card';
import { Badge } from './ui/Badge';
import { EmptyState } from './ui/EmptyState';
import { PRIORITY_COLORS_KANBAN, STATUS_INDICATOR_COLORS } from '../shared/constants/colors';
import { PRIORITY_ICONS } from '../shared/constants/icons';

interface KanbanBoardProps {
  tasks: Task[];
  selectedTaskId?: string | null;
  onSelectTask?: (id: string) => void;
}

interface TaskCardProps {
  task: Task;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  hasConflict?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = memo(({ task, isSelected, onSelect, hasConflict }) => {
  const { t, locale } = useI18n();

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!onSelect) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(task.id);
    }
  }, [onSelect, task.id]);

  const handleClick = useCallback(() => {
    onSelect?.(task.id);
  }, [onSelect, task.id]);

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "transition-all duration-200 cursor-pointer group animate-fade-in relative overflow-hidden shrink-0",
        isSelected
          ? 'border-primary/50 ring-2 ring-primary/20 shadow-md'
          : task.isMilestone
            ? 'border-joule-start/20 shadow-sm ring-1 ring-joule-start/30'
            : 'border-border-subtle shadow-sm hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5'
      )}
    >
      {task.isMilestone && (
        <div className="absolute top-0 right-0 w-8 h-8 bg-gradient-to-bl from-joule-start/20 to-transparent -mr-4 -mt-4 rotate-45 pointer-events-none" aria-hidden="true" />
      )}

      <CardHeader className="p-4 pb-2 space-y-0">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-base font-semibold leading-snug text-text-primary flex-1 min-w-0">
             <div className="flex flex-wrap items-center gap-1.5">
                {hasConflict && (
                  <AlertTriangle className="w-4 h-4 text-negative shrink-0" aria-label={t('task.schedule_conflict')} />
                )}
                {task.wbs && (
                  <span className="text-[10px] font-mono text-text-secondary tracking-tight shrink-0 leading-none">
                    [{task.wbs}]
                  </span>
                )}
                <span className="break-words">{task.title}</span>
             </div>
          </CardTitle>
          <Badge
            variant="outline"
            className={cn("shrink-0 uppercase tracking-wider text-[10px] px-2 py-0.5 h-auto", PRIORITY_COLORS_KANBAN[task.priority])}
            icon={PRIORITY_ICONS[task.priority]}
          >
            {getPriorityShortLabel(task.priority, t)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 py-2">
        {task.description && (
          <p className="text-sm text-text-secondary mb-3 line-clamp-3 leading-relaxed">{task.description}</p>
        )}

        {/* Progress Bar */}
        <div className="group-hover:opacity-100 transition-opacity">
          <div className="flex justify-between text-xs text-text-secondary mb-1 font-medium">
            <span>{t('kanban.progress')}</span>
            <span className={task.completion === 100 ? 'text-success' : ''}>{task.completion || 0}%</span>
          </div>
          <div className="w-full bg-background h-1.5 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                task.completion === 100 ? 'bg-success' : 'bg-primary'
              )}
              style={{ width: `${task.completion || 0}%`}}
              aria-label={`${task.completion || 0}% complete`}
            />
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-2 border-t border-border-subtle mt-2 flex justify-between items-center">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {task.assignee ? (
            <div className="flex items-center gap-1.5 bg-primary/10 pr-2 py-0.5 rounded-full border border-primary/10 max-w-full">
              <div className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[8px] font-bold shrink-0">
                {task.assignee.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-primary truncate font-medium" title={task.assignee}>
                {task.assignee}
              </span>
            </div>
          ) : (
            <span className="text-xs text-text-secondary italic">{t('task.unassigned')}</span>
          )}
        </div>

        {task.dueDate && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium shrink-0 ml-2",
             task.dueDate < Date.now() && task.status !== TaskStatus.DONE
              ? 'text-negative bg-negative/10 px-1.5 py-0.5 rounded'
              : 'text-text-secondary'
          )}>
            <Calendar className="w-3.5 h-3.5" />
            {new Date(task.dueDate).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
          </div>
        )}
      </CardFooter>
    </Card>
  );
});
TaskCard.displayName = 'TaskCard';

export const KanbanBoard: React.FC<KanbanBoardProps> = memo(({ tasks, selectedTaskId, onSelectTask }) => {
  const { t } = useI18n();

  // Calculate tasks with conflicts for visual indicator
  const tasksWithConflicts = useMemo(() => getTasksWithConflicts(tasks), [tasks]);

  const groupedTasks = useMemo(() => {
    const groups = {
      [TaskStatus.TODO]: [] as Task[],
      [TaskStatus.IN_PROGRESS]: [] as Task[],
      [TaskStatus.DONE]: [] as Task[],
    };
    tasks.forEach((task) => {
      if (groups[task.status]) {
        groups[task.status].push(task);
      }
    });
    return groups;
  }, [tasks]);

  return (
    <div className="h-full w-full overflow-x-auto overflow-y-hidden">
      <div className="flex h-full min-w-full gap-2 md:gap-4 pb-2 snap-x px-0 md:px-1">
        {([TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE] as TaskStatus[]).map((status) => (
          <div key={status} className="flex-1 min-w-[280px] sm:min-w-[300px] md:min-w-[320px] flex flex-col bg-background/50 rounded-2xl border border-border-subtle shadow-inner snap-center h-full overflow-hidden">
            <div className="p-3 sm:p-4 flex justify-between items-center sticky top-0 z-10 shrink-0">
              <h3 className="font-bold text-text-primary text-sm sm:text-base flex items-center gap-2">
                <span className={cn("w-2.5 h-2.5 rounded-md", STATUS_INDICATOR_COLORS[status])} aria-hidden="true" />
                {getStatusLabel(status, t)}
              </h3>
              <span className="bg-surface border border-border-subtle text-text-secondary font-mono text-xs px-2 py-0.5 rounded-full shadow-sm" aria-label={`${groupedTasks[status].length} tasks`}>
                {groupedTasks[status].length}
              </span>
            </div>

            <div className="p-2 sm:p-3 pt-0 flex flex-col gap-2 sm:gap-3 overflow-y-auto flex-1 min-h-0 custom-scrollbar pb-4">
              {groupedTasks[status].length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title={t('kanban.empty_title')}
                  description={t('kanban.empty_subtitle')}
                  variant="default"
                  className="h-48 m-1"
                />
              ) : (
                groupedTasks[status].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onSelect={onSelectTask}
                    hasConflict={tasksWithConflicts.has(task.id)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
KanbanBoard.displayName = 'KanbanBoard';