import { useMemo, memo, useCallback, useEffect, useState } from 'react';
import { Task, TaskStatus, Priority } from '../types';
import { addDays, dateStringToMs, formatDateInput, getTaskEnd, getTaskStart, parseDateInput, todayDateString } from '../src/utils';
import { useI18n } from '../src/i18n';
import { getPriorityLabel, getStatusLabel } from '../src/i18n/labels';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { cn } from '../src/utils/cn';
import { X, AlertTriangle, Check, Calendar, Flag, Link, Unlink, Link2, Trash2 } from 'lucide-react';

const clampCompletion = (value: number) => Math.min(100, Math.max(0, value));

interface TaskDetailPanelProps {
  selectedTask: Task | null;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onRequestDelete?: (task: Task) => void;
  onRegisterSave?: (save: (() => void) | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  tasks: Task[];
  isMobile?: boolean;
};

interface TaskDetailDraft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  startDateInput: string;
  dueDateInput: string;
  assignee: string;
  wbs: string;
  completion: number;
  predecessors: string[];
  isMilestone: boolean;
}

export const TaskDetailPanel = memo<TaskDetailPanelProps>(({
  selectedTask,
  onClose,
  onUpdate,
  onRequestDelete,
  onRegisterSave,
  onDirtyChange,
  tasks,
  isMobile = false
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState<TaskDetailDraft | null>(null);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const buildDraft = useCallback((task: Task): TaskDetailDraft => ({
    title: task.title ?? '',
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    startDateInput: formatDateInput(task.startDate ?? task.createdAt),
    dueDateInput: formatDateInput(task.dueDate),
    assignee: task.assignee ?? '',
    wbs: task.wbs ?? '',
    completion: task.completion ?? 0,
    predecessors: task.predecessors ? [...task.predecessors] : [],
    isMilestone: !!task.isMilestone,
  }), []);

  useEffect(() => {
    if (!selectedTask) return;
    setDraft(buildDraft(selectedTask));
    setShowUnsavedPrompt(false);
  }, [selectedTask, buildDraft]);

  const isDraftDirty = useMemo(() => {
    if (!selectedTask || !draft) return false;
    const baselineStart = formatDateInput(selectedTask.startDate ?? selectedTask.createdAt);
    const baselineDue = formatDateInput(selectedTask.dueDate);
    if (draft.title !== selectedTask.title) return true;
    if (draft.description !== (selectedTask.description ?? '')) return true;
    if (draft.status !== selectedTask.status) return true;
    if (draft.priority !== selectedTask.priority) return true;
    if (draft.startDateInput !== baselineStart) return true;
    if (draft.dueDateInput !== baselineDue) return true;
    if (draft.assignee !== (selectedTask.assignee ?? '')) return true;
    if (draft.wbs !== (selectedTask.wbs ?? '')) return true;
    if (draft.completion !== (selectedTask.completion ?? 0)) return true;
    if (draft.isMilestone !== !!selectedTask.isMilestone) return true;
    const baselinePredecessors = selectedTask.predecessors ?? [];
    if (draft.predecessors.length !== baselinePredecessors.length) return true;
    for (let i = 0; i < draft.predecessors.length; i += 1) {
      if (draft.predecessors[i] !== baselinePredecessors[i]) return true;
    }
    return false;
  }, [draft, selectedTask]);

  const predecessorDetails = useMemo(() => {
    if (!selectedTask || !draft) return [];
    const refs = draft.predecessors || [];
    const draftStart = parseDateInput(draft.startDateInput) ?? getTaskStart(selectedTask);
    return refs.map(ref => {
      const match = tasks.find(task => task.id === ref || task.wbs === ref);
      if (!match) {
        return { ref, task: null, conflict: false };
      }
      const conflict = dateStringToMs(getTaskEnd(match)) > dateStringToMs(draftStart);
      return { ref, task: match, conflict };
    });
  }, [selectedTask, draft, tasks]);

  const isOverdue = useMemo(() => {
    if (!selectedTask || !draft) return false;
    const dueDate = parseDateInput(draft.dueDateInput);
    if (!dueDate) return false;
    if (draft.status === TaskStatus.DONE) return false;
    return dateStringToMs(dueDate) < dateStringToMs(todayDateString());
  }, [selectedTask, draft]);

  const hasPredecessorConflicts = predecessorDetails.some(item => item.conflict);

  const availableTasks = useMemo(() => {
    if (!selectedTask || !draft) return [];
    return tasks.filter(task =>
      task.id !== selectedTask.id &&
      !draft.predecessors?.includes(task.id) &&
      (!task.wbs || !draft.predecessors?.includes(task.wbs))
    );
  }, [tasks, selectedTask, draft]);

  const handleDraftChange = useCallback(<K extends keyof TaskDetailDraft>(field: K, value: TaskDetailDraft[K]) => {
    setDraft(prev => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const handleRemovePredecessor = useCallback((ref: string) => {
    setDraft(prev => {
      if (!prev) return prev;
      const predecessors = prev.predecessors.filter(p => p !== ref);
      return { ...prev, predecessors };
    });
  }, []);

  const handleAddPredecessor = useCallback((taskId: string) => {
    setDraft(prev => {
      if (!prev) return prev;
      const predecessors = [...prev.predecessors, taskId];
      return { ...prev, predecessors };
    });
  }, []);

  const handleFixSchedule = useCallback(() => {
    if (!selectedTask || !draft) return;
    const maxEnd = predecessorDetails.reduce((acc, item) => {
      if (!item.task) return acc;
      const end = getTaskEnd(item.task);
      return dateStringToMs(end) > dateStringToMs(acc) ? end : acc;
    }, parseDateInput(draft.startDateInput) ?? getTaskStart(selectedTask));
    const currentStart = parseDateInput(draft.startDateInput) ?? getTaskStart(selectedTask);
    const currentEnd = parseDateInput(draft.dueDateInput) ?? getTaskEnd(selectedTask);
    const durationMs = Math.max(86_400_000, dateStringToMs(currentEnd) - dateStringToMs(currentStart));
    const nextStart = maxEnd;
    const nextEnd = addDays(nextStart, Math.ceil(durationMs / 86_400_000));
    setDraft(prev => (prev ? { ...prev, startDateInput: nextStart, dueDateInput: nextEnd } : prev));
  }, [selectedTask, draft, predecessorDetails]);

  const handleSave = useCallback(() => {
    if (!selectedTask || !draft) return;
    const updates: Partial<Task> = {};
    const baselineStart = formatDateInput(selectedTask.startDate ?? selectedTask.createdAt);
    const baselineDue = formatDateInput(selectedTask.dueDate);
    if (draft.title !== selectedTask.title) updates.title = draft.title;
    if (draft.description !== (selectedTask.description ?? '')) {
      updates.description = draft.description.trim() ? draft.description : undefined;
    }
    if (draft.status !== selectedTask.status) updates.status = draft.status;
    if (draft.priority !== selectedTask.priority) updates.priority = draft.priority;
    if (draft.startDateInput !== baselineStart) {
      const nextStart = parseDateInput(draft.startDateInput);
      if (nextStart) updates.startDate = nextStart;
    }
    if (draft.dueDateInput !== baselineDue) {
      const nextDue = parseDateInput(draft.dueDateInput);
      updates.dueDate = nextDue;
    }
    if (draft.assignee !== (selectedTask.assignee ?? '')) {
      updates.assignee = draft.assignee.trim() ? draft.assignee : undefined;
    }
    if (draft.wbs !== (selectedTask.wbs ?? '')) {
      updates.wbs = draft.wbs.trim() ? draft.wbs : undefined;
    }
    if (draft.completion !== (selectedTask.completion ?? 0)) updates.completion = draft.completion;
    if (draft.isMilestone !== !!selectedTask.isMilestone) updates.isMilestone = draft.isMilestone;
    const baselinePredecessors = selectedTask.predecessors ?? [];
    if (draft.predecessors.length !== baselinePredecessors.length
      || draft.predecessors.some((value, index) => value !== baselinePredecessors[index])) {
      updates.predecessors = draft.predecessors;
    }
    if (Object.keys(updates).length === 0) return;
    onUpdate(selectedTask.id, updates);
  }, [draft, onUpdate, selectedTask]);

  const handleAttemptClose = useCallback(() => {
    if (isDraftDirty) {
      setShowUnsavedPrompt(true);
      return;
    }
    onClose();
  }, [isDraftDirty, onClose]);

  useEffect(() => {
    if (!onRegisterSave) return;
    onRegisterSave(handleSave);
    return () => onRegisterSave(null);
  }, [handleSave, onRegisterSave]);

  useEffect(() => {
    onDirtyChange?.(isDraftDirty);
  }, [isDraftDirty, onDirtyChange]);

  if (!selectedTask || !draft) {
    return null;
  }

  return (
    <div className={cn(
      "bg-surface shadow-xl flex flex-col h-full animate-slide-in-right z-30",
      isMobile
        ? "w-full border-0"
        : "w-[350px] border-l border-border-subtle"
    )}>
      <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-surface/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{t('task.details')}</span>
          {draft.isMilestone && (
              <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-bold border border-accent/20">
                <Flag className="w-3 h-3" aria-hidden="true" fill="currentColor" />
                <span>{t('task.milestone')}</span>
              </span>
          )}
          {isDraftDirty && (
            <span className="text-[10px] font-semibold text-warning uppercase tracking-wider">
              {t('task.unsaved_badge')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            className="h-7 px-3 text-xs"
            disabled={!isDraftDirty}
          >
            {t('common.save')}
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => {
              if (selectedTask) onRequestDelete?.(selectedTask);
            }}
            className="h-7 w-7"
            aria-label={t('task.delete.button')}
            disabled={!onRequestDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleAttemptClose} className="h-7 w-7">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">

        {/* Task Identifiers - ID and WBS */}
        <div className="flex items-center gap-3 text-[10px] text-text-secondary">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold uppercase">ID:</span>
            <code className="bg-muted px-1.5 py-0.5 rounded text-[9px] font-mono">
              {(selectedTask.id?.substring(0, 8) ?? 'unknown')}…
            </code>
          </div>
          {selectedTask.wbs && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold uppercase">WBS:</span>
              <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold">
                {selectedTask.wbs}
              </code>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider" htmlFor="task-title">{t('task.title')}</label>
          <Input
            id="task-title"
            className="font-semibold text-sm h-9 px-3"
            value={draft.title}
            onChange={(event) => handleDraftChange('title', event.target.value)}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider" htmlFor="task-description">{t('task.description')}</label>
          <Textarea
            id="task-description"
            className="text-xs min-h-[80px] resize-y"
            placeholder={t('task.add_description')}
            value={draft.description}
            onChange={(event) => handleDraftChange('description', event.target.value)}
          />
        </div>

        {/* Status & Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider" htmlFor="task-status">{t('task.status')}</label>
            <select
              id="task-status"
              className="flex h-8 w-full rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              value={draft.status}
              onChange={(event) => handleDraftChange('status', event.target.value as TaskStatus)}
            >
              <option value={TaskStatus.TODO}>{getStatusLabel(TaskStatus.TODO, t)}</option>
              <option value={TaskStatus.IN_PROGRESS}>{getStatusLabel(TaskStatus.IN_PROGRESS, t)}</option>
              <option value={TaskStatus.DONE}>{getStatusLabel(TaskStatus.DONE, t)}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider" htmlFor="task-priority">{t('task.priority')}</label>
            <select
              id="task-priority"
              className="flex h-8 w-full rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              value={draft.priority}
              onChange={(event) => handleDraftChange('priority', event.target.value as Priority)}
            >
              <option value={Priority.LOW}>{getPriorityLabel(Priority.LOW, t)}</option>
              <option value={Priority.MEDIUM}>{getPriorityLabel(Priority.MEDIUM, t)}</option>
              <option value={Priority.HIGH}>{getPriorityLabel(Priority.HIGH, t)}</option>
            </select>
          </div>
        </div>

        {/* Dates */}
        <div className="p-3 bg-background rounded-lg border border-border-subtle space-y-3">
          <div className="flex items-center gap-2 text-text-primary font-semibold text-[11px] border-b border-border-subtle pb-1.5 mb-1">
             <Calendar className="w-3.5 h-3.5 text-primary" />
             {t('task.schedule')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-text-secondary" htmlFor="task-start">{t('task.start_date')}</label>
              <Input
                id="task-start"
                type="date"
                className="bg-surface h-7 text-xs px-2"
                value={draft.startDateInput}
                onChange={(event) => {
                  const nextValue = event.target.value || formatDateInput(selectedTask.startDate ?? selectedTask.createdAt);
                  handleDraftChange('startDateInput', nextValue);
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-text-secondary" htmlFor="task-due">{t('task.due_date')}</label>
              <Input
                id="task-due"
                type="date"
                className={cn("bg-surface h-7 text-xs px-2", isOverdue && "border-negative text-negative")}
                value={draft.dueDateInput}
                onChange={(event) => {
                  handleDraftChange('dueDateInput', event.target.value);
                }}
              />
            </div>
          </div>
        </div>

        {/* Assignee & WBS */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider" htmlFor="task-assignee">{t('task.assignee')}</label>
            <Input
              id="task-assignee"
              placeholder={t('task.unassigned')}
              className="h-8 text-xs px-2"
              value={draft.assignee}
              onChange={(event) => handleDraftChange('assignee', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider" htmlFor="task-wbs">{t('task.wbs_code')}</label>
            <Input
              id="task-wbs"
              className="font-mono text-[10px] h-8 px-2"
              placeholder="1.0"
              value={draft.wbs}
              onChange={(event) => handleDraftChange('wbs', event.target.value)}
            />
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
              <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider" htmlFor="task-completion">{t('task.completion')}</label>
              <span className="text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{draft.completion}%</span>
          </div>
          <input
            id="task-completion"
            type="range"
            min={0}
            max={100}
            value={draft.completion}
            onChange={(event) => handleDraftChange('completion', clampCompletion(Number(event.target.value)))}
            className="w-full h-1.5 bg-secondary/20 rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>

        {/* Dependencies */}
        <div className="space-y-2.5 pt-3 border-t border-border-subtle">
          <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Link className="w-3.5 h-3.5" aria-hidden="true" />
            {t('task.dependencies')}
            <span className="bg-secondary/10 text-secondary text-[10px] px-1.5 py-0.5 rounded-full">{predecessorDetails.length}</span>
          </label>

          <div className="space-y-1.5">
            {predecessorDetails.map((item) => (
              <div key={item.ref} className="flex items-center justify-between bg-background border border-border-subtle rounded-md p-2 group">
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-medium text-text-primary truncate">
                    {item.task ? item.task.title : item.ref}
                  </span>
                  {item.task && (
                    <span className="text-[9px] text-text-secondary font-mono">
                      {item.task.wbs ? `WBS: ${item.task.wbs}` : `ID: ${item.task.id.slice(0, 8)}`}
                    </span>
                  )}
                  {!item.task && (
                    <span className="text-[9px] text-negative italic">{t('task.not_found')}</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemovePredecessor(item.ref)}
                  className="p-1 text-text-secondary hover:text-negative hover:bg-negative/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                  title={t('task.remove_dependency')}
                >
                  <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}

            <div className="relative">
              <select
                className="flex h-8 w-full rounded-md border border-border-subtle bg-surface px-2 py-1 pr-8 text-xs appearance-none ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                value=""
                onChange={(event) => {
                  const taskId = event.target.value;
                  if (taskId) handleAddPredecessor(taskId);
                }}
              >
                <option value="">{t('task.add_dependency')}</option>
                {availableTasks.map(task => (
                  <option key={task.id} value={task.id}>
                     {task.wbs ? `[${task.wbs}] ` : ''}{task.title}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-text-secondary">
                <Link2 className="w-4 h-4" aria-hidden="true" />
              </div>
            </div>
          </div>

          {hasPredecessorConflicts && (
            <div className="bg-negative/5 border border-negative/20 rounded-md p-2 animate-fade-in" role="alert">
              <div className="flex items-start gap-1.5 text-negative mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold">{t('task.schedule_conflict')}</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleFixSchedule}
                className="w-full h-7 text-xs"
              >
                {t('task.fix_schedule')}
              </Button>
            </div>
          )}
        </div>

        <div className="pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer group p-1.5 hover:bg-background rounded-md border border-transparent hover:border-border-subtle transition-all">
              <div className={cn(
                "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                selectedTask.isMilestone ? "bg-accent border-accent text-accent-foreground" : "bg-surface border-border-subtle group-hover:border-accent"
              )}>
                {selectedTask.isMilestone && <Check className="w-3 h-3" />}
              </div>
              <input
              type="checkbox"
              className="hidden"
              checked={draft.isMilestone}
              onChange={(event) => handleDraftChange('isMilestone', event.target.checked)}
            />
            <span className="text-xs text-text-primary font-medium">{t('task.mark_milestone')}</span>
          </label>
        </div>

      </div>
      <Modal
        isOpen={showUnsavedPrompt}
        onClose={() => setShowUnsavedPrompt(false)}
        title={t('task.unsaved_title')}
      >
        <p className="text-sm text-text-secondary mb-4">
          {t('task.unsaved_body')}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUnsavedPrompt(false)}
            className="h-9"
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowUnsavedPrompt(false);
              onClose();
            }}
            className="h-9"
          >
            {t('common.discard')}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              handleSave();
              setShowUnsavedPrompt(false);
              onClose();
            }}
            className="h-9"
          >
            {t('common.save')}
          </Button>
        </div>
      </Modal>
    </div>
  );
});
TaskDetailPanel.displayName = 'TaskDetailPanel';
