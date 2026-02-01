import React, { useState, useEffect, useRef, useMemo, Suspense, useCallback, memo } from 'react';
import { ProjectSidebar } from './components/ProjectSidebar';
import { WorkspacePanel } from './components/WorkspacePanel';
import { Button } from './components/ui/Button';
import { cn } from './src/utils/cn';
import { Menu, Grid, List as ListIcon, Calendar, Upload, Download, History, MessageSquare, FileText, Check, Minus, Plus } from 'lucide-react';
import { LoginModal } from './components/LoginModal';
import WorkspaceModal from './components/WorkspaceModal';
import { UserProfileModal } from './components/UserProfileModal';
import { ChatInterface } from './components/ChatInterface';
import { AuditPanel } from './components/AuditPanel';
import { TaskDetailPanel } from './components/TaskDetailPanel';
import { CreateProjectModal } from './components/CreateProjectModal';
import { Task, ChatMessage } from './types';
import { useProjectData } from './src/hooks/useProjectData';
import { useAuth } from './src/hooks/useAuth';
import { useWorkspaces } from './src/hooks/useWorkspaces';
import { useDrafts } from './src/hooks/useDrafts';
import { useAuditLogs } from './src/hooks/useAuditLogs';
import { useChat } from './src/hooks/useChat';
import { useExport } from './src/hooks/useExport';
import { useImageExport } from './src/hooks/useImageExport';
import { generateId, storageGet, storageSet, storageGetJSON, storageSetJSON, findZoomIndex, DEFAULT_ZOOM_STATE, type ZoomState, type ViewMode } from './src/utils';
import { MobileNavBar, MobileTab } from './components/MobileNavBar';
import { useI18n } from './src/i18n';
import { Image as ImageIcon } from 'lucide-react';

// Lazy Load View Components
const KanbanBoard = React.lazy(() => import('./components/KanbanBoard').then(module => ({ default: module.KanbanBoard })));
const ListView = React.lazy(() => import('./components/ListView').then(module => ({ default: module.ListView })));
const GanttChart = React.lazy(() => import('./components/GanttChart').then(module => ({ default: module.GanttChart })));

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

function App() {
  const { t } = useI18n();
  const zoomLevels = useMemo(() => [0.6, 0.8, 1, 1.2, 1.4], []);
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  // Mobile State
  const [mobileTab, setMobileTab] = useState<MobileTab>('workspace');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = storageGet('viewMode');
    // Validate the stored value is a valid ViewMode
    if (stored === 'BOARD' || stored === 'LIST' || stored === 'GANTT') {
      return stored;
    }
    return 'LIST';
  });
  const [viewZoom, setViewZoom] = useState<ZoomState>(() =>
    storageGetJSON('viewZoom', DEFAULT_ZOOM_STATE)
  );
  const viewContainerRef = useRef<HTMLDivElement>(null);
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
  const [guestThinking, setGuestThinking] = useState(() =>
    storageGet('guestThinking') === 'true'
  );

  const effectiveAllowThinking = user ? (user.allowThinking ?? false) : guestThinking;

  const handleToggleThinking = useCallback(async (enabled: boolean) => {
    try {
      if (user) {
        await updateProfile({ allowThinking: enabled });
      } else {
        setGuestThinking(enabled);
        storageSet('guestThinking', String(enabled));
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
    fetchAllTasks,
    invalidateCache
  } = useProjectData(activeWorkspaceId);

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find(task => task.id === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId]
  );

  // 2. Chat State (Lifted)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const loadedProjectIdRef = useRef<string | null>(null);

  // Persist chat messages
  // defined BEFORE the load effect to ensure the ref check works correctly during transitions
  useEffect(() => {
    if (!activeProjectId) return;
    
    // Only save if the messages in state belong to the active project
    // This prevents overwriting the new project's history with the old project's messages
    // during the transition render cycle.
    if (loadedProjectIdRef.current !== activeProjectId) return;

    const key = `chat_history_${activeProjectId}`;
    storageSet(key, JSON.stringify(messages));
  }, [messages, activeProjectId]);

  // Load chat messages when active project changes
  useEffect(() => {
    if (!activeProjectId) return;
    
    // If we've already loaded for this project, don't reload
    // (This helps if activeProjectId is stable across renders)
    if (loadedProjectIdRef.current === activeProjectId) return;
    
    const key = `chat_history_${activeProjectId}`;
    const saved = storageGet(key);
    let loadedMessages: ChatMessage[];

    if (saved) {
      try {
        loadedMessages = JSON.parse(saved) as ChatMessage[];
      } catch {
        loadedMessages = [{
          id: 'welcome',
          role: 'model',
          text: t('chat.welcome'),
          timestamp: Date.now(),
        }];
      }
    } else {
        loadedMessages = [{
          id: 'welcome',
          role: 'model',
          text: t('chat.welcome'),
          timestamp: Date.now(),
        }];
    }
    
    setMessages(loadedMessages);
    loadedProjectIdRef.current = activeProjectId;
  }, [activeProjectId, t]);

  const appendSystemMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'system',
      text,
      timestamp: Date.now(),
    }]);
  }, []);

  const appendModelMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'model',
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
  }, [t]);

  // 3. Audit Logs
  const { 
    auditLogs, auditTotal, isAuditLoading, auditError,
    auditPage, setAuditPage, auditPageSize, setAuditPageSize, auditFilters, setAuditFilters,
    refreshAuditLogs
  } = useAuditLogs({
    activeProjectId
  });

  // 4. Drafts
  const {
    pendingDraft, draftWarnings, isProcessingDraft,
    submitDraft, handleApplyDraft, handleDiscardDraft
  } = useDrafts({
    activeProjectId,
    refreshData,
    refreshAuditLogs,
    appendSystemMessage,
    appendModelMessage,
    onProjectModified: invalidateCache
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
    submitDraft,
    appendSystemMessage,
    messages,
    setMessages,
    allowThinking: effectiveAllowThinking
  });

  // 6. Export/Import
  const {
    isExportOpen, setIsExportOpen,
    lastExportFormat,
    handleExportTasks, handleImportFile
  } = useExport({
    projects,
    activeProject,
    activeTasks,
    refreshData,
    submitDraft,
    fetchAllTasks
  });

  const { handleExportImage } = useImageExport({
    viewContainerRef,
    viewMode,
    projectId: activeProjectId,
    projectName: activeProject.name
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
    window.flowsyncExport = (format?: 'csv' | 'json' | 'markdown') => {
      void handleExportTasks(format ?? lastExportFormat);
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (window.flowsyncExport) {
        delete window.flowsyncExport;
      }
    };
  }, [handleExportTasks, lastExportFormat]);

  const handleExportMenuPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-export-format]');
    if (!button) return;
    const format = button.dataset.exportFormat as 'csv' | 'json' | 'markdown' | 'image' | undefined;
    if (!format) return;
    
    event.preventDefault();
    if (format === 'image') {
      void handleExportImage();
    } else {
      void handleExportTasks(format);
    }
    setIsExportOpen(false);
  }, [handleExportTasks, handleExportImage]);

  const handleSelectTask = useCallback((id: string | null) => {
    setSelectedTaskId(id);
    if (id) {
      setIsSidebarOpen(false);
    }
  }, []);

  // Manual Project Actions
  const manualCreateProject = useCallback(() => {
    setIsCreateProjectOpen(true);
  }, []);

  const handleCreateProject = useCallback(async (name: string, description: string) => {
    invalidateCache();
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
  }, [submitDraft, invalidateCache]);

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

  // Derived State
  const currentZoom = viewZoom[viewMode];
  const zoomIndex = useMemo(() => findZoomIndex(zoomLevels, currentZoom), [zoomLevels, currentZoom]);

  const updateZoom = useCallback(
    (mode: ViewMode, value: number) => {
      setViewZoom((prev) => ({ ...prev, [mode]: value }));
    },
    []
  );

  const handleZoomStep = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = Math.max(0, Math.min(zoomLevels.length - 1, zoomIndex + direction));
      const nextValue = zoomLevels[nextIndex] ?? 1;
      updateZoom(viewMode, nextValue);
    },
    [updateZoom, viewMode, zoomIndex, zoomLevels]
  );

  useEffect(() => {
    storageSet('viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    storageSetJSON('viewZoom', viewZoom);
  }, [viewZoom]);

  return (
    <div
      className="flex h-screen h-[100dvh] w-full bg-background overflow-hidden text-text-primary font-sans selection:bg-primary/20 selection:text-primary flex-col md:flex-row"
    >
      
      {/* 1. Project Sidebar (Left) */}
      <div className={cn(
        "transition-all duration-300 overflow-hidden bg-surface relative z-20 flex-shrink-0",
        // Desktop
        "md:block",
        isSidebarOpen ? "md:w-[260px] md:border-r md:border-border-subtle" : "md:w-0 md:border-none",
        // Mobile
        (isMobile && mobileTab === 'projects') ? "flex-1 w-full border-b border-border-subtle" : (isMobile ? "hidden" : "")
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
          onSelectProject={(id) => {
            handleSelectProject(id);
            if (isMobile) setMobileTab('workspace');
          }}
          onCreateProject={manualCreateProject}
          onDeleteProject={handleDeleteProject}
          onClose={() => {
            setIsSidebarOpen(false);
            if (isMobile) setMobileTab('workspace');
          }}
        />
      </div>

      {/* 2. Workspace (Middle) */}
      <div className={cn(
        "flex-1 flex flex-col bg-background relative overflow-hidden min-w-0",
        (isMobile && mobileTab !== 'workspace') ? "hidden" : "flex"
      )}>
        {/* Zoom wrapper - applies zoom only to workspace content, not mobile nav bar */}
        <div style={{ zoom: currentZoom } as React.CSSProperties} className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className={cn(
            "min-h-[3.5rem] py-2 border-b border-border-subtle flex items-center flex-wrap gap-2 bg-surface/80 backdrop-blur-md z-20 sticky top-0 shrink-0",
            isMobile ? "px-2" : "px-4"
          )}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(prev => !prev)}
            title={isSidebarOpen ? t('app.sidebar.close') : t('app.sidebar.open')}
            className={cn("h-8 w-8 text-text-secondary hover:text-primary", isMobile && "hidden")}
          >
            <Menu className="w-4 h-4" />
          </Button>

          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text-primary leading-tight truncate">{activeProject.name}</h2>
              <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary rounded-full border border-primary/20">
                {t('app.view.' + viewMode.toLowerCase())}
              </span>
            </div>
            {activeProject.description && (
               <p className="text-[10px] font-medium text-text-secondary truncate">{activeProject.description}</p>
            )}
          </div>

          {/* View Switcher */}
          <Button
            variant={viewMode === 'BOARD' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('BOARD')}
            className="h-7 px-2 md:h-8 md:px-3 text-xs"
          >
            <Grid className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">{t('app.view.board')}</span>
          </Button>
          <Button
            variant={viewMode === 'LIST' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('LIST')}
            className="h-7 px-2 md:h-8 md:px-3 text-xs"
          >
            <ListIcon className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">{t('app.view.list')}</span>
          </Button>
          <Button
            variant={viewMode === 'GANTT' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('GANTT')}
            className="h-7 px-2 md:h-8 md:px-3 text-xs"
          >
            <Calendar className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">{t('app.view.gantt')}</span>
          </Button>

          {/* Zoom Panel - desktop only */}
          <div className="hidden md:flex items-center flex-wrap gap-1 bg-background/50 rounded-lg border border-border-subtle px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/70 mr-1">{t('app.zoom')}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleZoomStep(-1)}
              disabled={zoomIndex === 0}
              className="h-8 w-8 p-0"
              title={t('app.zoom.out')}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="text-xs font-mono text-text-secondary min-w-[40px] text-center">{Math.round(currentZoom * 100)}%</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleZoomStep(1)}
              disabled={zoomIndex === zoomLevels.length - 1}
              className="h-8 w-8 p-0"
              title={t('app.zoom.in')}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Import */}
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
            className="h-8 px-3 text-xs"
          >
            <Upload className="w-4 h-4 mr-2" />
            {t('app.header.import')}
          </Button>

          {/* Audit Button */}
          <div className="relative">
            <Button
              variant={isAuditOpen ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setIsAuditOpen(prev => !prev)}
              className="h-8 px-3 text-xs gap-2"
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
              className="h-8 px-3 text-xs gap-2"
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
                    { id: 'image', label: t('export.format.image') || 'Image (PNG)', desc: t('export.format.image_desc') || 'Export view as image', icon: ImageIcon },
                    { id: 'csv', label: 'CSV', desc: t('export.format.csv_desc'), icon: FileText },
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
            className={cn("h-8 w-8", isMobile && "hidden")}
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
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
        <div className={cn(
          "flex-1 overflow-hidden relative z-10 custom-scrollbar flex",
          isMobile ? "p-1.5 gap-1.5" : "p-4 gap-4"
        )}>
          {isLoadingData ? (
            <LoadingSpinner message={t('app.loading.project_data')} />
          ) : (
            <>
              <div ref={viewContainerRef} className="flex-1 min-w-0 h-full overflow-hidden relative">
                <Suspense fallback={<LoadingSpinner message={t('app.loading.view')} />}>
                  {viewMode === 'BOARD' && (
                    <div className="h-full w-full">
                      <KanbanBoard
                        tasks={activeTasks}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={handleSelectTask}
                      />
                    </div>
                  )}
                  {viewMode === 'LIST' && (
                    <div className="h-full w-full">
                      <ListView
                        tasks={activeTasks}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={handleSelectTask}
                      />
                    </div>
                  )}
                  {viewMode === 'GANTT' && (
                    <div className="flex-1 h-full min-w-0 bg-surface rounded-xl border border-border-subtle shadow-sm overflow-hidden">
                      <GanttChart
                        tasks={activeTasks}
                        projectId={activeProjectId}
                        zoom={1}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={handleSelectTask}
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
                selectedTask 
                  ? (isMobile ? "fixed inset-0 z-50 p-4 bg-background/95 backdrop-blur-sm" : "w-[350px] opacity-100 translate-x-0") 
                  : (isMobile ? "hidden" : "w-0 opacity-0 translate-x-10 pointer-events-none")
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
      </div>

      {/* 3. Chat Interface (Right) */}
      <div className={cn(
          (isMobile && mobileTab !== 'chat') ? "hidden" : "flex-1 min-h-0 md:flex-none md:block md:h-auto"
      )}>
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
          isMobile={isMobile}
          project={activeProject ?? undefined}
          tasks={activeTasks}
          isProcessingDraft={isProcessingDraft}
        />
      </div>

      <MobileNavBar
        activeTab={mobileTab}
        onSelectTab={setMobileTab}
      />
    </div>
  );
}

export default memo(App);
