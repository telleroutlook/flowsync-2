import React, { memo, useCallback, useMemo } from 'react';
import type { User, WorkspaceWithMembership } from '../types';
import { useI18n } from '../src/i18n';
import { LogOut, ChevronDown, Settings } from 'lucide-react';

interface WorkspacePanelProps {
  user: User | null;
  workspaces: WorkspaceWithMembership[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenLogin: () => void;
  onLogout: () => void | Promise<void>;
  onOpenManage: () => void;
  onOpenProfile: () => void;
}

export const WorkspacePanel = memo<WorkspacePanelProps>(({
  user,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenLogin,
  onLogout,
  onOpenManage,
  onOpenProfile,
}) => {
  const { t } = useI18n();

  const userInitial = useMemo(() => user ? user.username.charAt(0).toUpperCase() : '?', [user]);
  const userName = useMemo(() => user ? user.username : t('auth.guest'), [user, t]);

  const handleLogout = useCallback(() => {
    void onLogout();
  }, [onLogout]);

  const handleWorkspaceChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    onSelectWorkspace(event.target.value);
  }, [onSelectWorkspace]);

  return (
    <div className="p-4 space-y-4">
      {/* User Info Section */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden">
           <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm shadow-sm ${
             user ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'
           }`}>
             {userInitial}
           </div>
           <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-text-primary truncate">
                {userName}
              </span>
              <button
                onClick={onOpenProfile}
                className="text-xs text-secondary hover:text-primary text-left transition-colors truncate"
              >
                {t('profile.open')}
              </button>
           </div>
        </div>

        <div>
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 text-secondary hover:text-negative hover:bg-negative/10 rounded-md transition-all"
              title={t('auth.logout')}
              aria-label={t('auth.logout')}
            >
              <LogOut className="w-6 h-6" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              className="text-sm font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-2 rounded-lg transition-colors"
            >
              {t('auth.login')}
            </button>
          )}
        </div>
      </div>

      {/* Workspace Selector */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-secondary uppercase tracking-widest">
          {t('workspace.title')}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              value={activeWorkspaceId}
              onChange={handleWorkspaceChange}
              className="w-full appearance-none rounded-lg border border-border-subtle bg-surface pl-3 pr-8 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary hover:border-primary/50 transition-all shadow-sm cursor-pointer"
              aria-label={t('workspace.select')}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}{workspace.isPublic ? ` (${t('workspace.public')})` : ''}
                </option>
              ))}
            </select>
             <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-secondary">
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>

          {user && (
            <button
              type="button"
              onClick={onOpenManage}
              className="flex items-center justify-center w-10 h-[38px] rounded-lg border border-border-subtle bg-surface text-secondary hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all shadow-sm"
              title={t('workspace.manage')}
              aria-label={t('workspace.manage')}
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
WorkspacePanel.displayName = 'WorkspacePanel';
