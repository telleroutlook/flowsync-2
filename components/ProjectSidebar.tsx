import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Project } from '../types';
import { useI18n } from '../src/i18n';
import { cn } from '../src/utils/cn';
import { Button } from './ui/Button';
import { Plus, ChevronLeft, Trash2, Lightbulb, Box, MoreVertical, Pencil } from 'lucide-react';

export interface ProjectSidebarProps {
  topSlot?: React.ReactNode;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onEditProject: (project: Project) => void;
  onRequestDeleteProject: (project: Project) => void;
  onClose: () => void;
}

export interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  onSelectProject: (id: string) => void;
  onEditProject: (project: Project) => void;
  onRequestDeleteProject: (project: Project) => void;
  t: ReturnType<typeof useI18n>['t'];
}

const ProjectItem = memo<ProjectItemProps>(({ project, isActive, onSelectProject, onEditProject, onRequestDeleteProject, t }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleClick = useCallback(() => {
    onSelectProject(project.id);
  }, [project.id, onSelectProject]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectProject(project.id);
    }
  }, [project.id, onSelectProject]);

  const handleMenuToggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setIsMenuOpen((prev) => !prev);
  }, []);

  const handleEdit = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setIsMenuOpen(false);
    onEditProject(project);
  }, [onEditProject, project]);

  const handleDelete = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setIsMenuOpen(false);
    onRequestDeleteProject(project);
  }, [onRequestDeleteProject, project]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 border mb-1",
        isActive
          ? "bg-surface text-primary border-border-subtle shadow-sm ring-1 ring-primary/5"
          : "text-text-secondary hover:bg-surface-active border-transparent hover:border-transparent"
      )}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={cn(
          "flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold shadow-sm transition-transform group-hover:scale-105",
          isActive 
            ? "bg-primary text-primary-foreground" 
            : "bg-surface text-text-secondary border border-border-subtle"
        )} aria-hidden="true">
          {project.icon || project.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col min-w-0">
          <span className={cn(
            "truncate text-sm font-semibold leading-tight",
            isActive ? "text-text-primary" : "text-text-primary/80"
          )}>{project.name}</span>
          {project.description && (
            <span className="truncate text-[10px] text-text-secondary leading-tight mt-0.5">{project.description}</span>
          )}
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMenuToggle}
          className={cn(
            "h-7 w-7 opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary hover:bg-surface-active transition-all rounded-md",
            isActive && "opacity-0 group-hover:opacity-100"
          )}
          title={t('app.sidebar.actions')}
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </Button>

        {isMenuOpen && (
          <div
            className="absolute right-0 mt-1 w-40 rounded-lg border border-border-subtle bg-surface shadow-lg z-20 overflow-hidden"
            role="menu"
          >
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-xs font-medium text-text-primary hover:bg-surface-active flex items-center gap-2"
              onClick={handleEdit}
              role="menuitem"
            >
              <Pencil className="w-3.5 h-3.5" />
              {t('app.sidebar.edit')}
            </button>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-xs font-medium text-negative hover:bg-negative/10 flex items-center gap-2"
              onClick={handleDelete}
              role="menuitem"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('app.sidebar.delete')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
ProjectItem.displayName = 'ProjectItem';

export const ProjectSidebar = memo<ProjectSidebarProps>(({
  topSlot,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onEditProject,
  onRequestDeleteProject,
  onClose,
}) => {
  const { t } = useI18n();
  const systemHints = useMemo(
    () => [
      t('app.sidebar.systemHint.register'),
      t('app.sidebar.systemHint.public'),
    ],
    [t]
  );
  const [systemHintIndex, setSystemHintIndex] = useState(0);
  const previousProjectId = useRef<string | null>(null);

  useEffect(() => {
    if (previousProjectId.current && previousProjectId.current !== activeProjectId) {
      setSystemHintIndex(prev => (prev + 1) % systemHints.length);
    }
    previousProjectId.current = activeProjectId;
  }, [activeProjectId, systemHints.length]);

  return (
    <div className="w-full bg-background/50 flex flex-col h-full shrink-0 shadow-sm z-10 md:bg-background">
      {/* Brand / Top Slot Area */}
      {topSlot ? (
        <div className="border-b border-border-subtle bg-surface/50 backdrop-blur-sm">
          {topSlot}
        </div>
      ) : (
        <div className="h-14 flex items-center px-4 border-b border-border-subtle bg-surface">
             <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm mr-3">
                <Box className="w-5 h-5 text-white" />
             </div>
             <span className="font-bold text-text-primary tracking-tight">FlowSync</span>
        </div>
      )}

      {/* Projects Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">{t('app.sidebar.projects')}</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateProject}
            className="h-7 w-7 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-md"
            title={t('app.sidebar.create')}
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="h-7 w-7 text-text-secondary hover:text-text-primary hover:bg-surface-active rounded-md md:hidden"
            title={t('app.sidebar.collapse')}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-0.5">
        {projects.map(project => (
          <ProjectItem
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            onSelectProject={onSelectProject}
            onEditProject={onEditProject}
            onRequestDeleteProject={onRequestDeleteProject}
            t={t}
          />
        ))}
        
        {projects.length === 0 && (
             <div className="text-center py-8 px-4">
                 <p className="text-xs text-text-secondary mb-3">{t('project.none')}</p>
                 <Button size="sm" variant="outline" onClick={onCreateProject} className="w-full">
                    {t('app.sidebar.create')}
                 </Button>
             </div>
        )}
      </div>

      {/* Footer / Tip */}
      <div className="p-2 border-t border-border-subtle bg-surface/30">
         <a 
           href={`mailto:teller.lin@sap.com?subject=${encodeURIComponent(t('app.sidebar.tip.subject'))}`}
           className="bg-surface rounded-lg p-2 border border-border-subtle shadow-sm flex items-center gap-2 hover:bg-surface-active hover:shadow-md transition-all cursor-pointer group/tip"
         >
            <div className="p-1 rounded-full bg-accent/10 text-accent shrink-0 group-hover/tip:bg-accent group-hover/tip:text-white transition-colors">
                <Lightbulb className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-text-primary">{t('app.sidebar.tip')}</span>
            </div>
         </a>
         <div className="mt-1.5 text-[10px] text-text-secondary">
            {systemHints[systemHintIndex]}
         </div>
      </div>
    </div>
  );
});
ProjectSidebar.displayName = 'ProjectSidebar';
