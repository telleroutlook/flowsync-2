import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { useI18n } from '../src/i18n';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { cn } from '../src/utils/cn';
import type { Project } from '../types';

interface EditProjectModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onSave: (id: string, name: string, description: string) => void | Promise<void>;
}

export const EditProjectModal = memo<EditProjectModalProps>(({ isOpen, project, onClose, onSave }) => {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !project) return;
    setName(project.name);
    setDescription(project.description ?? '');
    setIsSubmitting(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen, project]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !name.trim()) return;
    setIsSubmitting(true);
    try {
      await onSave(project.id, name.trim(), description.trim());
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [project, name, description, onSave, onClose]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handleDescChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  }, []);

  if (!isOpen || !project) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('project.edit.title')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="project-edit-name" className="block text-sm font-medium text-text-secondary mb-1.5">
            {t('project.edit.name')} <span className="text-critical">*</span>
          </label>
          <Input
            ref={inputRef}
            id="project-edit-name"
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder={t('project.edit.placeholder_name')}
            required
          />
        </div>
        <div>
          <label htmlFor="project-edit-desc" className="block text-sm font-medium text-text-secondary mb-1.5">
            {t('project.edit.description')} <span className="text-xs text-text-secondary/60 font-normal">{t('project.edit.optional')}</span>
          </label>
          <textarea
            id="project-edit-desc"
            value={description}
            onChange={handleDescChange}
            className={cn(
              "flex min-h-[80px] w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm ring-offset-background placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            )}
            placeholder={t('project.edit.placeholder_description')}
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t('project.edit.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={!name.trim() || isSubmitting}
            isLoading={isSubmitting}
          >
            {t('project.edit.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
});
EditProjectModal.displayName = 'EditProjectModal';
