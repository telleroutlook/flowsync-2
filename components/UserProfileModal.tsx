import React, { memo, useCallback, useMemo } from 'react';
import type { User } from '../types';
import { useI18n } from '../src/i18n';
import { Modal } from './Modal';
import { cn } from '../src/utils/cn';
import { ChevronDown, Languages, Brain, CheckCircle, User as UserIcon } from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  allowThinking: boolean;
  onToggleThinking: (enabled: boolean) => void | Promise<void>;
}

export const UserProfileModal = memo<UserProfileModalProps>(({ isOpen, onClose, user, allowThinking, onToggleThinking }) => {
  const { t, locale, setLocale } = useI18n();
  const [isUpdating, setIsUpdating] = React.useState(false);

  const userInitial = useMemo(() => user ? user.username.charAt(0).toUpperCase() : '?', [user]);

  const handleLocaleChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === 'en' || value === 'zh') setLocale(value);
  }, [setLocale]);

  const handleThinkingChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onToggleThinking(event.target.checked);
    } finally {
      setIsUpdating(false);
    }
  }, [onToggleThinking, isUpdating]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('profile.title')}>
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-6 bg-background rounded-xl border border-border-subtle">
           <div className={cn(
             "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shadow-sm mb-3",
             user ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "bg-secondary/10 text-text-secondary"
           )}>
             {userInitial}
           </div>

           <div className="text-center">
             {user ? (
               <>
                 <h3 className="text-xl font-bold text-text-primary">{user.username}</h3>
                 <div className="flex items-center justify-center gap-2 mt-1.5">
                   <CheckCircle className="w-5 h-5 text-success" aria-hidden="true" />
                   <span className="inline-block px-2.5 py-1 rounded-md bg-success/10 text-success border border-success/20 text-xs font-bold uppercase tracking-wider">
                     {t('auth.signed_in')}
                   </span>
                 </div>
               </>
             ) : (
               <>
                 <div className="flex items-center justify-center gap-2">
                   <UserIcon className="w-5 h-5 text-text-secondary" aria-hidden="true" />
                   <h3 className="text-xl font-bold text-text-secondary">{t('auth.guest')}</h3>
                 </div>
                 <p className="text-sm text-text-secondary/60 mt-1 max-w-[200px]">{t('profile.guest_hint')}</p>
               </>
             )}
           </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs font-bold text-text-secondary uppercase tracking-wide" htmlFor="profile-language">
              <Languages className="w-4 h-4 text-text-secondary" aria-hidden="true" />
              {t('language.label')}
            </label>
            <div className="relative">
              <select
                id="profile-language"
                value={locale}
                onChange={handleLocaleChange}
                aria-label={t('language.switch')}
                className="w-full appearance-none rounded-lg border border-border-subtle bg-surface px-4 py-3 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary shadow-sm transition-all hover:border-primary/50 cursor-pointer"
              >
                <option value="en">🇺🇸 {t('language.english')}</option>
                <option value="zh">🇨🇳 {t('language.chinese')}</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-text-secondary">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border-subtle bg-surface">
            <div className="space-y-0.5">
              <label htmlFor="allow-thinking" className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Brain className="w-4 h-4 text-text-secondary" aria-hidden="true" />
                {t('profile.thinking.label')}
              </label>
              <p className="text-xs text-text-secondary">{t('profile.thinking.description')}</p>
              {allowThinking && (
                <p className="text-xs text-warning mt-1 flex items-center gap-1">
                  <span>⚠️</span>
                  <span>{t('profile.thinking.warning')}</span>
                </p>
              )}
            </div>
            <label className={cn("relative inline-flex items-center", isUpdating ? "cursor-not-allowed opacity-70" : "cursor-pointer")} htmlFor="allow-thinking">
              <input
                type="checkbox"
                id="allow-thinking"
                className="sr-only peer"
                checked={allowThinking}
                onChange={handleThinkingChange}
                disabled={isUpdating}
              />
              <span className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></span>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
});
UserProfileModal.displayName = 'UserProfileModal';
