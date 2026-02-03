import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import { useI18n } from '../src/i18n';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import type { Project } from '../types';

interface DeleteProjectModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onConfirm: (id: string) => void | Promise<void>;
}

export const DeleteProjectModal = memo<DeleteProjectModalProps>(({ isOpen, project, onClose, onConfirm }) => {
  const { t } = useI18n();
  const [confirmationName, setConfirmationName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !project) return;
    setConfirmationName('');
    setIsSubmitting(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen, project]);

  const isMatch = useMemo(() => {
    if (!project) return false;
    return confirmationName.trim() === project.name;
  }, [confirmationName, project]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !isMatch) return;
    setIsSubmitting(true);
    try {
      await onConfirm(project.id);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [project, isMatch, onConfirm, onClose]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmationName(e.target.value);
  }, []);

  if (!isOpen || !project) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('project.delete.title')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          {t('project.delete.description', { name: project.name })}
        </p>
        <div>
          <label htmlFor="project-delete-confirm" className="block text-sm font-medium text-text-secondary mb-1.5">
            {t('project.delete.confirm_label', { name: project.name })}
          </label>
          <Input
            ref={inputRef}
            id="project-delete-confirm"
            type="text"
            value={confirmationName}
            onChange={handleInputChange}
            placeholder={t('project.delete.confirm_placeholder')}
            required
          />
          <p className="mt-2 text-xs text-text-secondary">
            {t('project.delete.confirm_hint', { name: project.name })}
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t('project.delete.cancel')}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={!isMatch || isSubmitting}
            isLoading={isSubmitting}
          >
            {t('project.delete.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
});
DeleteProjectModal.displayName = 'DeleteProjectModal';
