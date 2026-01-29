import React, { memo } from 'react';
import { Layout, CheckSquare, MessageSquare } from 'lucide-react';
import { cn } from '../src/utils/cn';
import { useI18n } from '../src/i18n';

export type MobileTab = 'projects' | 'workspace' | 'chat';

interface MobileNavBarProps {
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  chatUnreadCount?: number;
}

export const MobileNavBar = memo<MobileNavBarProps>(({ activeTab, onSelectTab, chatUnreadCount }) => {
  const { t } = useI18n();

  return (
    <div className="md:hidden flex items-center justify-around bg-surface/90 backdrop-blur-lg border-t border-border-subtle min-h-[64px] px-2 pb-[env(safe-area-inset-bottom)] z-50 shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
      <button
        onClick={() => onSelectTab('projects')}
        className={cn(
          "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors relative",
          activeTab === 'projects' ? "text-primary" : "text-text-secondary hover:text-text-primary"
        )}
      >
        <Layout className="w-5 h-5" />
        <span className="text-[10px] font-medium">{t('app.sidebar.projects')}</span>
      </button>

      <button
        onClick={() => onSelectTab('workspace')}
        className={cn(
          "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors relative",
          activeTab === 'workspace' ? "text-primary" : "text-text-secondary hover:text-text-primary"
        )}
      >
        <CheckSquare className="w-5 h-5" />
        <span className="text-[10px] font-medium">{t('app.mobile.tasks')}</span>
      </button>

      <button
        onClick={() => onSelectTab('chat')}
        className={cn(
          "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors relative",
          activeTab === 'chat' ? "text-primary" : "text-text-secondary hover:text-text-primary"
        )}
      >
        <div className="relative">
            <MessageSquare className="w-5 h-5" />
            {chatUnreadCount && chatUnreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-critical opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-critical"></span>
                </span>
            ) : null}
        </div>
        <span className="text-[10px] font-medium">{t('app.mobile.chat')}</span>
      </button>
    </div>
  );
});

MobileNavBar.displayName = 'MobileNavBar';
