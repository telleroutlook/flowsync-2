import React, { useState, useEffect, useRef, useMemo, Suspense, useCallback, memo } from 'react';
import { ProjectSidebar } from './components/ProjectSidebar';
import { WorkspacePanel } from './components/WorkspacePanel';
import { Button } from './components/ui/Button';
import { cn } from './src/utils/cn';
import { Menu, X, Grid, List as ListIcon, Calendar, Upload, Download, History, MessageSquare, FileText, Check, MoreVertical, Minus, Plus, RotateCcw } from 'lucide-react';
import { LoginModal } from './components/LoginModal';
import WorkspaceModal from './components/WorkspaceModal';
import { UserProfileModal } from './components/UserProfileModal';
import { ChatInterface } from './components/ChatInterface';
import { AuditPanel } from './components/AuditPanel';
import { TaskDetailPanel } from './components/TaskDetailPanel';
import { CreateProjectModal } from './components/CreateProjectModal';
import { Task, DraftAction, ChatMessage, TaskStatus } from './types';
import { useProjectData } from './src/hooks/useProjectData';
import { useAuth } from './src/hooks/useAuth';
import { useWorkspaces } from './src/hooks/useWorkspaces';
import { useDrafts } from './src/hooks/useDrafts';
import { useAuditLogs } from './src/hooks/useAuditLogs';
import { useChat } from './src/hooks/useChat';
import { useExport } from './src/hooks/useExport';
import { generateId } from './src/utils';
import { useI18n } from './src/i18n';
import { DAY_MS, GANTT_PX_PER_DAY, type GanttViewMode } from './src/constants/gantt';

// Lazy Load View Components
const KanbanBoard = React.lazy(() => import('./components/KanbanBoard').then(module => ({ default: module.KanbanBoard })));
const ListView = React.lazy(() => import('./components/ListView').then(module => ({ default: module.ListView })));
const GanttChart = React.lazy(() => import('./components/GanttChart').then(module => ({ default: module.GanttChart })));

type ViewMode = 'BOARD' | 'LIST' | 'GANTT';
type ZoomState = {
  BOARD: number;
  LIST: number;
  GANTT: number;
};
type ZoomSignature = {
  count: number;
  spanDays?: number;
};
type ZoomMeta = {
  signature: ZoomSignature | null;
  userOverride: boolean;
};
type ZoomMetaState = {
  BOARD: ZoomMeta;
  LIST: ZoomMeta;
  GANTT: ZoomMeta;
};

// Memoized loading spinner component
const LoadingSpinner = memo(({ message }: { message: string }) => (
  <div className="flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
      <p className="text-sm text-secondary font-medium">{message}</p>
    </div>
  </div>
));
LoadingSpinner.displayName = 'LoadingSpinner';

const computeGanttTimelineRange = (tasks: Task[], viewMode: GanttViewMode) => {
  if (tasks.length === 0) return null;
  const starts = tasks.map((task) => task.startDate ?? task.createdAt);
  const ends = tasks.map((task) => {
    const start = task.startDate ?? task.createdAt;
    const end = task.dueDate ?? start + DAY_MS;
    return end <= start ? start + DAY_MS : end;
  });
  const rawStart = Math.min(...starts);
  const rawEnd = Math.max(...ends);
  const startDate = new Date(rawStart);
  startDate.setDate(startDate.getDate() - 7);
  const endDate = new Date(rawEnd);
  endDate.setDate(endDate.getDate() + 14);

  if (viewMode === 'Year') {
    startDate.setMonth(0, 1);
    endDate.setMonth(11, 31);
  } else if (viewMode === 'Month') {
    startDate.setDate(1);
    endDate.setMonth(endDate.getMonth() + 1, 0);
  } else if (viewMode === 'Week') {
    const day = startDate.getDay();
    startDate.setDate(startDate.getDate() - ((day + 6) % 7));
  }

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return { startMs: startDate.getTime(), endMs: endDate.getTime() };
};

// Simplified zoom level picker - reduced from 10 to 3 lines
const pickZoomLevel = (levels: number[], ratio: number): number => {
  if (levels.length === 0) return 1;
  const [min, max] = [levels[0], levels[levels.length - 1]];
  const clamped = Math.max(min, Math.min(max, ratio));
  return levels.filter((l) => l <= clamped).pop() ?? min;
};

function App() {
  const { t } = useI18n();
  const zoomLevels = useMemo(() => [0.6, 0.8, 1, 1.2, 1.4], []);
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('GANTT'); 
  const [viewZoom, setViewZoom] = useState<ZoomState>(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('flowsync:viewZoom') : null;
    if (!raw) return { BOARD: 1, LIST: 1, GANTT: 1 };
    try {
      const parsed = JSON.parse(raw) as Partial<ZoomState>;
      return {
        BOARD: typeof parsed.BOARD === 'number' ? parsed.BOARD : 1,
        LIST: typeof parsed.LIST === 'number' ? parsed.LIST : 1,
        GANTT: typeof parsed.GANTT === 'number' ? parsed.GANTT : 1,
      };
    } catch {
      return { BOARD: 1, LIST: 1, GANTT: 1 };
    }
  });
  const [zoomMeta, setZoomMeta] = useState<ZoomMetaState>(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('flowsync:viewZoomMeta') : null;
    if (!raw) {
      return {
        BOARD: { signature: null, userOverride: false },
        LIST: { signature: null, userOverride: false },
        GANTT: { signature: null, userOverride: false },
      };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<ZoomMetaState>;
      const normalize = (value?: ZoomMeta): ZoomMeta => ({
        signature: value?.signature ?? null,
        userOverride: value?.userOverride ?? false,
      });
      return {
        BOARD: normalize(parsed.BOARD),
        LIST: normalize(parsed.LIST),
        GANTT: normalize(parsed.GANTT),
      };
    } catch {
      return {
        BOARD: { signature: null, userOverride: false },
        LIST: { signature: null, userOverride: false },
        GANTT: { signature: null, userOverride: false },
      };
    }
  });
  const [ganttViewMode, setGanttViewMode] = useState<GanttViewMode>('Month');
  const viewContainerRef = useRef<HTMLDivElement>(null);
  const [viewContainerSize, setViewContainerSize] = useState({ width: 0, height: 0 });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // Refs
  const importInputRef = useRef<HTMLInputElement>(null);
  const pendingTaskUpdatesRef = useRef<Record<string, Partial<Task>>>({});
  const taskUpdateTimers = useRef<Map<string, number>>(new Map());

  // --- HOOKS ---

  // 1. Auth & Workspaces
  const { user, error: authError, login, register, logout, updateProfile } = useAuth();
  
  // Guest Thinking State
  const [guestThinking, setGuestThinking] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('flowsync:guestThinking') === 'true';
  });

  const effectiveAllowThinking = user ? (user.allowThinking ?? false) : guestThinking;

  const handleToggleThinking = useCallback(async (enabled: boolean) => {
    try {
      if (user) {
        await updateProfile({ allowThinking: enabled });
      } else {
        setGuestThinking(enabled);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('flowsync:guestThinking', String(enabled));
        }
      }
    } catch (err) {
      console.error('Failed to toggle thinking:', err);
    }
  }, [user, updateProfile]);

  const {
    workspaces,
    accessibleWorkspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    pendingRequests,
    members,
    createWorkspace,
    requestJoin,
    approveRequest,
    rejectRequest,
    removeMember,
  } = useWorkspaces(user);

  // 2. Data
  const { 
    projects, 
    tasks, 
    setTasks, 
    activeProjectId, 
    activeProject, 
    activeTasks, 
    isLoading: isLoadingData, 
    error: dataError,
    refreshData, 
    handleSelectProject,
    fetchAllTasks
  } = useProjectData(activeWorkspaceId);

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find(task => task.id === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId]
  );

  // 2. Chat State (Lifted)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('flowsync_chat_history');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          localStorage.removeItem('flowsync_chat_history');
        }
      }
    }
    return [{
      id: 'welcome',
      role: 'model',
      text: t('chat.welcome'),
      timestamp: Date.now(),
    }];
  });

  // Persist chat messages
  useEffect(() => {
    localStorage.setItem('flowsync_chat_history', JSON.stringify(messages));
  }, [messages]);

  const appendSystemMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'system',
      text,
      timestamp: Date.now(),
    }]);
  }, []);

  const handleResetChat = useCallback(() => {
    const initialMsg: ChatMessage = {
      id: 'welcome',
      role: 'model',
      text: t('chat.welcome'),
      timestamp: Date.now(),
    };
    setMessages([initialMsg]);
    localStorage.removeItem('flowsync_chat_history');
  }, [t]);

  // 3. Audit Logs
  const { 
    auditLogs, auditTotal, isAuditLoading, auditError,
    auditPage, setAuditPage, auditPageSize, setAuditPageSize, auditFilters, setAuditFilters,
    refreshAuditLogs
  } = useAuditLogs({ 
    activeProjectId, 
    refreshData,
    appendSystemMessage 
  });

  // 4. Drafts
  const {
    drafts, pendingDraft, pendingDraftId, setPendingDraftId, draftWarnings,
    refreshDrafts, submitDraft, handleApplyDraft, handleDiscardDraft
  } = useDrafts({ 
    activeProjectId, 
    refreshData, 
    refreshAuditLogs, 
    appendSystemMessage 
  });

  // 5. Chat Logic
  const {
    inputText, setInputText, isProcessing, pendingAttachments,
    handleAttachFiles, handleRemoveAttachment, handleSendMessage, handleRetryLastMessage, processingSteps, thinkingPreview,
    messagesEndRef, fileInputRef
  } = useChat({
    activeProjectId,
    activeProject,
    activeTasks,
    selectedTask: selectedTask || null,
    projects,
    refreshData,
    submitDraft,
    handleApplyDraft,
    appendSystemMessage,
    messages,
    setMessages,
    allowThinking: effectiveAllowThinking
  });

  // 6. Export/Import
  const {
    isExportOpen, setIsExportOpen,
    lastExportFormat, importStrategy, recordImportPreference,
    handleExportTasks, handleImportFile
  } = useExport({
    projects,
    activeProject,
    activeTasks,
    refreshData,
    submitDraft,
    fetchAllTasks
  });

  // --- EFFECTS & HANDLERS ---

  // Handle selected task validation
  useEffect(() => {
    if (selectedTaskId && !tasks.find(task => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [tasks, selectedTaskId]);

  // Handle outside click for export menu - avoid capture to keep menu item clicks working
  useEffect(() => {
    if (!isExportOpen) return;
    const handleWindowClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (exportMenuRef.current?.contains(target)) return;
      if (exportButtonRef.current?.contains(target)) return;
      setIsExportOpen(false);
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [isExportOpen]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        void handleExportTasks(lastExportFormat);
      }
    };
    (window as any).flowsyncExport = (format?: 'csv' | 'pdf' | 'json' | 'markdown') => {
      void handleExportTasks(format ?? lastExportFormat);
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if ((window as any).flowsyncExport) {
        delete (window as any).flowsyncExport;
      }
    };
  }, [handleExportTasks, lastExportFormat]);

  const handleExportMenuPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-export-format]');
    if (!button) return;
    const format = button.dataset.exportFormat as 'csv' | 'pdf' | 'json' | 'markdown' | undefined;
    if (!format) return;
    event.preventDefault();
    void handleExportTasks(format);
    setIsExportOpen(false);
  }, [handleExportTasks]);

  // Manual Project Actions
  const manualCreateProject = useCallback(() => {
    setIsCreateProjectOpen(true);
  }, []);

  const handleCreateProject = useCallback(async (name: string, description: string) => {
    await submitDraft(
      [
        {
          id: generateId(),
          entityType: 'project',
          action: 'create',
          after: { name, description },
        },
      ],
      { createdBy: 'user', autoApply: true, reason: 'Manual project create' }
    );
  }, [submitDraft]);

  const handleDeleteProject = useCallback(async (id: string) => {
    await submitDraft(
      [
        {
          id: generateId(),
          entityType: 'project',
          action: 'delete',
          entityId: id,
        },
      ],
      { createdBy: 'user', autoApply: true, reason: 'Manual project delete' }
    );
  }, [submitDraft]);

  // Optimistic Task Updates with Debounce
  const queueTaskUpdate = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === id
          ? { ...task, ...updates }
          : task
      )
    );

    pendingTaskUpdatesRef.current[id] = {
      ...(pendingTaskUpdatesRef.current[id] || {}),
      ...updates,
    };

    const existing = taskUpdateTimers.current.get(id);
    if (existing) window.clearTimeout(existing);

    const timer = window.setTimeout(async () => {
      const payload = pendingTaskUpdatesRef.current[id];
      if (!payload) return;
      delete pendingTaskUpdatesRef.current[id];
      taskUpdateTimers.current.delete(id);
      await submitDraft(
        [
          {
            id: generateId(),
            entityType: 'task',
            action: 'update',
            entityId: id,
            after: payload,
          },
        ],
        { createdBy: 'user', autoApply: true, reason: 'Inline task update', silent: true }
      );
    }, 600);

    taskUpdateTimers.current.set(id, timer);
  }, [setTasks, submitDraft]);

  // Derived State - memoized to prevent recreation on every render
  const viewLabels: Record<ViewMode, string> = useMemo(() => ({
    BOARD: t('app.view.board'),
    LIST: t('app.view.list'),
    GANTT: t('app.view.gantt'),
  }), [t]);

  const currentZoom = viewZoom[viewMode];
  const zoomIndex = useMemo(() => {
    const exactIndex = zoomLevels.findIndex((level) => level === currentZoom);
    if (exactIndex !== -1) return exactIndex;
    let closest = 0;
    let minDiff = Math.abs(zoomLevels[0] - currentZoom);
    zoomLevels.forEach((level, index) => {
      const diff = Math.abs(level - currentZoom);
      if (diff < minDiff) {
        minDiff = diff;
        closest = index;
      }
    });
    return closest;
  }, [currentZoom, zoomLevels]);

  const updateZoom = useCallback((mode: ViewMode, value: number, markUserOverride: boolean = true) => {
    setViewZoom((prev) => ({ ...prev, [mode]: value }));
    if (markUserOverride) {
      setZoomMeta((prev) => {
        const signature = prev[mode].signature;
        return { ...prev, [mode]: { signature, userOverride: true } };
      });
    }
  }, []);

  const handleZoomStep = useCallback((direction: -1 | 1) => {
    const nextIndex = Math.max(0, Math.min(zoomLevels.length - 1, zoomIndex + direction));
    const nextValue = zoomLevels[nextIndex];
    updateZoom(viewMode, nextValue);
  }, [updateZoom, viewMode, zoomIndex, zoomLevels]);

  useEffect(() => {
    const el = viewContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      setViewContainerSize({ width: el.clientWidth || 0, height: el.clientHeight || 0 });
    };
    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [viewMode]);

  const computeSignature = useCallback((mode: ViewMode): ZoomSignature => {
    const count = activeTasks.length;
    if (mode !== 'GANTT') return { count };
    const range = computeGanttTimelineRange(activeTasks, ganttViewMode);
    const spanDays = range ? Math.max(1, Math.ceil((range.endMs - range.startMs) / DAY_MS)) : 1;
    return { count, spanDays };
  }, [activeTasks, ganttViewMode]);

  const isMajorChange = useCallback((mode: ViewMode, prev: ZoomSignature | null, next: ZoomSignature) => {
    if (!prev) return true;
    const countDiff = Math.abs(next.count - prev.count);
    if (countDiff >= 3) return true;
    if (mode === 'GANTT') {
      const prevSpan = prev.spanDays ?? 0;
      const nextSpan = next.spanDays ?? 0;
      return Math.abs(nextSpan - prevSpan) >= 7;
    }
    return false;
  }, []);

  const computeAutoZoom = useCallback((mode: ViewMode) => {
    const { width, height } = viewContainerSize;
    if (width <= 0 || height <= 0) return 1;

    if (mode === 'LIST') {
      const headerHeight = 48;
      const rowHeight = 44;
      const rows = activeTasks.length;
      if (rows === 0) return 1;
      const neededHeight = headerHeight + rows * rowHeight;
      return pickZoomLevel(zoomLevels, height / neededHeight);
    }

    if (mode === 'BOARD') {
      const counts = {
        todo: activeTasks.filter((task) => task.status === TaskStatus.TODO).length,
        inProgress: activeTasks.filter((task) => task.status === TaskStatus.IN_PROGRESS).length,
        done: activeTasks.filter((task) => task.status === TaskStatus.DONE).length,
      };
      const maxCards = Math.max(counts.todo, counts.inProgress, counts.done);
      if (maxCards === 0) return 1;
      const headerHeight = 72;
      const cardHeight = 160;
      const cardGap = 12;
      const padding = 24;
      const neededHeight = headerHeight + padding + maxCards * cardHeight + Math.max(0, maxCards - 1) * cardGap;
      return pickZoomLevel(zoomLevels, height / neededHeight);
    }

    const range = computeGanttTimelineRange(activeTasks, ganttViewMode);
    if (!range) return 1;
    const spanDays = Math.max(1, Math.ceil((range.endMs - range.startMs) / DAY_MS));
    const pxPerDay = GANTT_PX_PER_DAY[ganttViewMode] || 10;
    const neededWidth = spanDays * pxPerDay;
    return pickZoomLevel(zoomLevels, width / neededWidth);
  }, [activeTasks, ganttViewMode, viewContainerSize, zoomLevels]);

  useEffect(() => {
    const mode = viewMode;
    const signature = computeSignature(mode);
    const meta = zoomMeta[mode];
    const shouldAuto = isMajorChange(mode, meta.signature, signature);
    if (!shouldAuto) return;
    const nextZoom = computeAutoZoom(mode);
    updateZoom(mode, nextZoom, false);
    setZoomMeta((prev) => ({
      ...prev,
      [mode]: {
        signature,
        userOverride: false,
      },
    }));
  }, [computeAutoZoom, computeSignature, isMajorChange, updateZoom, viewMode, zoomMeta]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('flowsync:viewZoom', JSON.stringify(viewZoom));
    } catch {
      // ignore storage errors
    }
  }, [viewZoom]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('flowsync:viewZoomMeta', JSON.stringify(zoomMeta));
    } catch {
      // ignore storage errors
    }
  }, [zoomMeta]);

  return (
    <div className="flex h-screen h-[100dvh] w-full bg-background overflow-hidden text-text-primary font-sans selection:bg-primary/20 selection:text-primary">
      
      {/* 1. Project Sidebar (Left) */}
      <div className={cn(
        "transition-all duration-300 overflow-hidden bg-surface relative z-20 flex-shrink-0",
        isSidebarOpen ? "w-[260px] border-r border-border-subtle" : "w-0 border-none"
      )}>
        <ProjectSidebar 
          topSlot={(
            <WorkspacePanel
              user={user}
              workspaces={accessibleWorkspaces}
              activeWorkspaceId={activeWorkspaceId}
              onSelectWorkspace={setActiveWorkspaceId}
              onOpenLogin={() => setIsLoginOpen(true)}
              onLogout={logout}
              onOpenManage={() => setIsWorkspaceOpen(true)}
              onOpenProfile={() => setIsProfileOpen(true)}
            />
          )}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onCreateProject={manualCreateProject}
          onDeleteProject={handleDeleteProject}
          onClose={() => setIsSidebarOpen(false)}
        />
      </div>

      {/* 2. Workspace (Middle) */}
      <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-border-subtle flex items-center justify-between px-4 bg-surface/80 backdrop-blur-md z-20 sticky top-0 shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(prev => !prev)}
              title={isSidebarOpen ? t('app.sidebar.close') : t('app.sidebar.open')}
            >
              <Menu className="w-5 h-5" />
            </Button>

            <div className="flex flex-col">
              <h2 className="text-sm font-bold text-text-primary leading-tight truncate max-w-[200px]">{activeProject.name}</h2>
              {activeProject.description && (
                 <p className="text-[10px] font-medium text-text-secondary truncate max-w-[200px]">{activeProject.description}</p>
              )}
            </div>
            
            <div className="h-5 w-px bg-border-subtle mx-2"></div>

            {/* View Switcher */}
            <div className="flex p-1 bg-background/50 rounded-lg border border-border-subtle gap-1">
               <Button
                 variant={viewMode === 'BOARD' ? 'secondary' : 'ghost'}
                 size="sm"
                 onClick={() => setViewMode('BOARD')}
                 className="h-7 px-2 text-xs"
               >
                 <Grid className="w-3.5 h-3.5 mr-1.5" />
                 {t('app.view.board')}
               </Button>
               <Button
                 variant={viewMode === 'LIST' ? 'secondary' : 'ghost'}
                 size="sm"
                 onClick={() => setViewMode('LIST')}
                 className="h-7 px-2 text-xs"
               >
                 <ListIcon className="w-3.5 h-3.5 mr-1.5" />
                 {t('app.view.list')}
               </Button>
               <Button
                 variant={viewMode === 'GANTT' ? 'secondary' : 'ghost'}
                 size="sm"
                 onClick={() => setViewMode('GANTT')}
                 className="h-7 px-2 text-xs"
               >
                 <Calendar className="w-3.5 h-3.5 mr-1.5" />
                 {t('app.view.gantt')}
               </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
             {/* Zoom Panel */}
             <div className="flex items-center gap-1 bg-background/50 rounded-lg border border-border-subtle px-2 py-1">
               <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/70">{t('app.zoom')}</span>
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={() => handleZoomStep(-1)}
                 disabled={zoomIndex === 0}
                 className="h-7 w-7 p-0"
                 title={t('app.zoom.out')}
               >
                 <Minus className="w-3.5 h-3.5" />
               </Button>
               <span className="text-xs font-mono text-text-secondary min-w-[44px] text-center">{Math.round(currentZoom * 100)}%</span>
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={() => handleZoomStep(1)}
                 disabled={zoomIndex === zoomLevels.length - 1}
                 className="h-7 w-7 p-0"
                 title={t('app.zoom.in')}
               >
                 <Plus className="w-3.5 h-3.5" />
               </Button>
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={() => updateZoom(viewMode, 1)}
                 disabled={currentZoom === 1}
                 className="h-7 px-2 text-[10px] uppercase tracking-wider"
                 title={t('app.zoom.reset')}
               >
                 <RotateCcw className="w-3 h-3 mr-1" />
                 {t('app.zoom.reset')}
               </Button>
             </div>

             {/* Import Group */}
             <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border-subtle shadow-sm">
               <input
                 ref={importInputRef}
                 type="file"
                 accept=".json,.csv,.tsv"
                 className="hidden"
                 onChange={(event) => {
                   const file = event.target.files?.[0];
                   if (file) handleImportFile(file);
                   event.currentTarget.value = '';
                 }}
               />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => importInputRef.current?.click()}
                className="h-7 px-2 text-xs"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {t('app.header.import')}
              </Button>
              <div className="w-px h-3 bg-border-subtle"></div>
              <select
                value={importStrategy}
                onChange={(event) => {
                  const value = event.target.value;
                  recordImportPreference(value === 'merge' ? 'merge' : 'append');
                }}
                className="bg-transparent text-xs font-medium text-text-secondary outline-none cursor-pointer hover:text-primary border-none py-0 focus:ring-0 h-7"
                aria-label={t('app.header.import_strategy')}
              >
                <option value="append">{t('app.header.import.append')}</option>
                <option value="merge">{t('app.header.import.merge')}</option>
              </select>
             </div>

             {/* Audit Button */}
             <div className="relative">
              <Button
                variant={isAuditOpen ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setIsAuditOpen(prev => !prev)}
                className="h-9 px-3 gap-2"
                aria-label={`${t('app.header.audit')} (${auditLogs.length})`}
              >
                <History className="w-4 h-4" />
                <span>{t('app.header.audit')}</span>
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary min-w-[18px] text-center">
                  {auditLogs.length}
                </span>
              </Button>
            </div>

             {/* Export Button */}
             <div className="relative">
              <Button
                 variant="outline"
                 size="sm"
                 onClick={(event) => {
                  event.stopPropagation();
                  setIsExportOpen(prev => !prev);
                 }}
                 ref={exportButtonRef}
                 className="h-9 px-3 gap-2"
               >
                 <span>{t('app.header.export')}</span>
                 <Download className="w-4 h-4" />
               </Button>
               {isExportOpen && (
                 <div
                   onClick={(event) => event.stopPropagation()}
                   onPointerDown={handleExportMenuPointerDown}
                   ref={exportMenuRef}
                   className="absolute right-0 mt-2 w-64 rounded-xl border border-border-subtle bg-surface shadow-xl z-50 p-2 animate-fade-in"
                   role="menu"
                 >
                   <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary/50">{t('app.header.format')}</div>
                   <div className="grid grid-cols-1 gap-1">
                     {([
                       { id: 'csv', label: 'CSV', desc: t('export.format.csv_desc'), icon: FileText },
                       { id: 'pdf', label: 'PDF', desc: t('export.format.pdf_desc'), icon: FileText },
                       { id: 'json', label: 'JSON', desc: t('export.format.json_desc'), icon: FileText },
                       { id: 'markdown', label: 'Markdown', desc: t('export.format.markdown_desc'), icon: FileText },
                     ] as const).map(item => (
                       <button
                         key={item.id}
                         type="button"
                         data-export-format={item.id}
                         className={cn(
                           "group flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors",
                           lastExportFormat === item.id ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-background' 
                         )}
                       >
                         <div className="flex items-center gap-3">
                            <item.icon className="w-4 h-4 opacity-70" />
                            <div className="flex flex-col items-start">
                              <span className="font-semibold">{item.label}</span>
                              <span className="text-[9px] opacity-70 group-hover:opacity-100">{item.desc}</span>
                            </div>
                         </div>
                         {lastExportFormat === item.id && <Check className="w-3 h-3 text-primary" />}
                       </button>
                     ))}
                   </div>

                 </div>
               )}
             </div>

             <Button 
                variant={isChatOpen ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setIsChatOpen(prev => !prev)}
                title={t('app.header.toggle_chat')}
             >
                <MessageSquare className="w-5 h-5" />
             </Button>
          </div>
        </div>

        {dataError && (
          <div className="px-6 py-3 text-sm font-medium bg-negative/5 text-negative border-b border-negative/20 flex items-center justify-between gap-3" role="alert">
            <span>{t('app.error.load_data', { error: dataError })}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void refreshData();
              }}
              disabled={isLoadingData}
              className="h-7 px-2 text-xs"
            >
              {t('common.retry')}
            </Button>
          </div>
        )}

        <AuditPanel
          isOpen={isAuditOpen}
          isLoading={isAuditLoading}
          onRefresh={() => refreshAuditLogs(activeProjectId)}
          filters={auditFilters}
          setFilters={setAuditFilters}
          logs={auditLogs}
          total={auditTotal}
          page={auditPage}
          setPage={setAuditPage}
          pageSize={auditPageSize}
          setPageSize={setAuditPageSize}
          error={auditError}
        />

        <CreateProjectModal
          isOpen={isCreateProjectOpen}
          onClose={() => setIsCreateProjectOpen(false)}
          onCreate={handleCreateProject}
        />

        <LoginModal
          isOpen={isLoginOpen}
          error={authError}
          onClose={() => setIsLoginOpen(false)}
          onLogin={login}
          onRegister={register}
        />

        <WorkspaceModal
          isOpen={isWorkspaceOpen}
          onClose={() => setIsWorkspaceOpen(false)}
          workspaces={workspaces}
          pendingRequests={pendingRequests}
          members={members}
          activeWorkspaceId={activeWorkspaceId}
          onCreate={createWorkspace}
          onRequestJoin={requestJoin}
          onApprove={approveRequest}
          onReject={rejectRequest}
          onRemoveMember={removeMember}
        />

        <UserProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          user={user}
          allowThinking={effectiveAllowThinking}
          onToggleThinking={handleToggleThinking}
        />

        {/* View Area */}
        <div className="p-4 flex-1 overflow-hidden relative z-10 custom-scrollbar flex gap-4">
          {isLoadingData ? (
            <LoadingSpinner message={t('app.loading.project_data')} />
          ) : (
            <>
              <div ref={viewContainerRef} className="flex-1 min-w-0 h-full overflow-hidden relative">
                <Suspense fallback={<LoadingSpinner message={t('app.loading.view')} />}>
                  {viewMode === 'BOARD' && (
                    <div
                      className="h-full w-full"
                      style={{
                        transform: `scale(${viewZoom.BOARD})`,
                        transformOrigin: 'top left',
                        width: `${100 / viewZoom.BOARD}%`,
                        height: `${100 / viewZoom.BOARD}%`,
                      }}
                    >
                      <KanbanBoard
                        tasks={activeTasks}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={(id) => setSelectedTaskId(id)}
                      />
                    </div>
                  )}
                  {viewMode === 'LIST' && (
                    <div
                      className="h-full w-full"
                      style={{
                        transform: `scale(${viewZoom.LIST})`,
                        transformOrigin: 'top left',
                        width: `${100 / viewZoom.LIST}%`,
                        height: `${100 / viewZoom.LIST}%`,
                      }}
                    >
                      <ListView
                        tasks={activeTasks}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={(id) => setSelectedTaskId(id)}
                      />
                    </div>
                  )}
                  {viewMode === 'GANTT' && (
                    <div className="flex-1 h-full min-w-0 bg-surface rounded-xl border border-border-subtle shadow-sm overflow-hidden">
                      <GanttChart
                        tasks={activeTasks}
                        projectId={activeProjectId}
                        zoom={viewZoom.GANTT}
                        onViewModeChange={setGanttViewMode}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={(id) => setSelectedTaskId(id)}
                        onUpdateTaskDates={(id, startDate, dueDate) => {
                          queueTaskUpdate(id, { startDate, dueDate });
                        }}
                      />
                    </div>
                  )}
                </Suspense>
              </div>

              <div className={cn(
                "transition-all duration-300",
                selectedTask ? "w-[350px] opacity-100 translate-x-0" : "w-0 opacity-0 translate-x-10 pointer-events-none"
              )}>
                {selectedTask && (
                  <TaskDetailPanel
                    selectedTask={selectedTask}
                    onClose={() => setSelectedTaskId(null)}
                    onUpdate={queueTaskUpdate}
                    tasks={tasks}
                  />
                )}
              </div>
            </>
          )}
        </div>
        
      </div>

      {/* 3. Chat Interface (Right) */}
      <ChatInterface
        isChatOpen={isChatOpen}
        setIsChatOpen={setIsChatOpen}
        onResetChat={handleResetChat}
        pendingDraft={pendingDraft}
        draftWarnings={draftWarnings}
        onApplyDraft={handleApplyDraft}
        onDiscardDraft={handleDiscardDraft}
        messages={messages}
        isProcessing={isProcessing}
        processingSteps={processingSteps}
        thinkingPreview={thinkingPreview}
        messagesEndRef={messagesEndRef}
        onSendMessage={handleSendMessage}
        onRetryLastMessage={handleRetryLastMessage}
        pendingAttachments={pendingAttachments}
        onRemoveAttachment={handleRemoveAttachment}
        fileInputRef={fileInputRef}
        onAttachFiles={handleAttachFiles}
        inputText={inputText}
        setInputText={setInputText}
      />
    </div>
  );
}

export default memo(App);
