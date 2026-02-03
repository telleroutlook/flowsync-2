import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
import { Modal } from './Modal';
import { useI18n } from '../src/i18n';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { User, Lock, AlertCircle, LogIn, UserPlus, Check } from 'lucide-react';
import type { ValidationErrorDetail } from '../src/utils/error';

interface LoginModalProps {
  isOpen: boolean;
  error?: string | null;
  errorDetails?: ValidationErrorDetail[] | null;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<unknown> | void;
  onRegister: (username: string, password: string) => Promise<unknown> | void;
}

export const LoginModal = memo<LoginModalProps>(({
  isOpen,
  error,
  errorDetails,
  onClose,
  onLogin,
  onRegister,
}) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUsername('');
      setPassword('');
      setMode('login');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await onLogin(username.trim(), password);
      } else {
        await onRegister(username.trim(), password);
      }
      onClose();
    } catch {
      // keep modal open and rely on error message from parent
    } finally {
      setIsSubmitting(false);
    }
  }, [username, password, mode, onLogin, onRegister, onClose]);

  const handleUsernameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(event.target.value);
  }, []);

  const handlePasswordChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'login' ? 'register' : 'login');
  }, []);

  const renderFieldLabel = useCallback((path: string) => {
    const key = path.split('.').pop() || path;
    if (key === 'username') return t('auth.username');
    if (key === 'password') return t('auth.password');
    return key || t('common.unknown_error');
  }, [t]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm ring-1 ring-primary/20">
          {mode === 'login' ? <LogIn className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
        </div>
        <h3 className="text-xl font-bold text-text-primary">
          {mode === 'login' ? t('auth.login_welcome') : t('auth.create_account')}
        </h3>
        <p className="text-sm text-text-secondary mt-1">
          {mode === 'login' ? t('auth.login_desc') : t('auth.register_desc')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="space-y-4">
          <div>
            <label htmlFor="auth-username" className="block text-xs font-bold text-text-secondary mb-1.5 uppercase tracking-wide">
              {t('auth.username')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-secondary/50">
                 <User className="w-4 h-4" />
              </div>
              <Input
                ref={inputRef}
                id="auth-username"
                type="text"
                value={username}
                onChange={handleUsernameChange}
                className="pl-9"
                placeholder={t('auth.username_placeholder')}
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="auth-password" className="block text-xs font-bold text-text-secondary mb-1.5 uppercase tracking-wide">
              {t('auth.password')}
            </label>
            <div className="relative">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-secondary/50">
                 <Lock className="w-4 h-4" />
               </div>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={handlePasswordChange}
                className="pl-9"
                placeholder={t('auth.password_placeholder')}
                required
              />
            </div>
            {mode === 'register' && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-text-secondary font-medium">Password requirements:</p>
                <ul className="space-y-0.5">
                  <PasswordRequirement text="At least 6 characters" met={password.length >= 6} />
                  <PasswordRequirement
                    text={`Character types (${getCharacterTypeCount(password)}/4):`}
                    met={getCharacterTypeCount(password) >= 2}
                    subtext="Need at least 2 of: uppercase, lowercase, number, special"
                  />
                </ul>
                {getCharacterTypeCount(password) > 0 && (
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <CharTypeBadge type="Upper" has={/[A-Z]/.test(password)} />
                    <CharTypeBadge type="Lower" has={/[a-z]/.test(password)} />
                    <CharTypeBadge type="Number" has={/[0-9]/.test(password)} />
                    <CharTypeBadge type="Special" has={/[^A-Za-z0-9]/.test(password)} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {(error || (errorDetails && errorDetails.length > 0)) && (
          <div className="rounded-lg border border-negative/20 bg-negative/10 px-3 py-2.5 text-xs font-medium text-negative">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error || t('common.unknown_error')}</span>
            </div>
            {errorDetails && errorDetails.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-negative/90">
                {errorDetails.map((detail, index) => (
                  <li key={`${detail.path}-${index}`}>
                    <span className="font-semibold">{renderFieldLabel(detail.path)}</span>
                    <span className="mx-1">·</span>
                    <span>{detail.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-2">
          <Button
            type="submit"
            disabled={isSubmitting || !username.trim() || !password}
            isLoading={isSubmitting}
            className="w-full font-bold shadow-md hover:shadow-lg transition-all"
          >
            {mode === 'login' ? t('auth.login') : t('auth.register')}
          </Button>
        </div>

        <div className="flex items-center justify-center gap-1 text-xs text-text-secondary mt-2">
           <span>{mode === 'login' ? t('auth.no_account') : t('auth.have_account')}</span>
          <button
            type="button"
            onClick={toggleMode}
            className="font-bold text-primary hover:text-primary-hover hover:underline transition-all"
          >
            {mode === 'login' ? t('auth.register_now') : t('auth.login_now')}
          </button>
        </div>
      </form>
    </Modal>
  );
});
LoginModal.displayName = 'LoginModal';

// Helper function to count character types in password
function getCharacterTypeCount(password: string): number {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
}

// Password requirement indicator component with check icon
interface PasswordRequirementProps {
  text: string;
  met: boolean;
  subtext?: string;
}

const PasswordRequirement = memo<PasswordRequirementProps>(({ text, met, subtext }) => (
  <li className="flex items-start gap-1.5 text-xs">
    <div className={`flex-shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center mt-0.5 ${met ? 'bg-positive/20' : 'bg-text-secondary/10'}`}>
      {met ? <Check className="w-2.5 h-2.5 text-positive" strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-text-secondary/40" />}
    </div>
    <div className="flex-1">
      <span className={met ? 'text-text-primary' : 'text-text-secondary'}>{text}</span>
      {subtext && <p className="text-[10px] text-text-secondary/70 mt-0.5">{subtext}</p>}
    </div>
  </li>
));
PasswordRequirement.displayName = 'PasswordRequirement';

// Character type badge component
interface CharTypeBadgeProps {
  type: 'Upper' | 'Lower' | 'Number' | 'Special';
  has: boolean;
}

const CharTypeBadge = memo<CharTypeBadgeProps>(({ type, has }) => {
  const labels = {
    Upper: 'A-Z',
    Lower: 'a-z',
    Number: '0-9',
    Special: '!@#',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${has ? 'bg-primary/15 text-primary ring-1 ring-primary/30' : 'bg-text-secondary/10 text-text-secondary/50'}`}>
      {labels[type]}
    </span>
  );
});
CharTypeBadge.displayName = 'CharTypeBadge';
