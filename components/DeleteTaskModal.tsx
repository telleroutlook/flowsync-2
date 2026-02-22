import { memo, useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useI18n } from '../src/i18n';
import { Button } from './ui/Button';
import type { Task } from '../types';
import { getErrorMessage } from '../src/utils/error';

interface DeleteTaskModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onConfirm: (id: string) => void | Promise<void>;
}

export const DeleteTaskModal = memo<DeleteTaskModalProps>(({ isOpen, task, onClose, onConfirm }) => {
  const { t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsSubmitting(false);
    setSubmitError(null);
  }, [isOpen]);

  const handleConfirm = useCallback(async () => {
    if (!task || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirm(task.id);
      onClose();
    } catch (error: unknown) {
      setSubmitError(t('task.delete.failed', { error: getErrorMessage(error, t('common.unknown_error')) }));
    } finally {
      setIsSubmitting(false);
    }
  }, [task, isSubmitting, onConfirm, onClose, t]);

  if (!isOpen || !task) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('task.delete.title')}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          {t('task.delete.description', { title: task.title })}
        </p>
        {submitError ? (
          <p className="text-sm text-danger" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t('task.delete.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
            isLoading={isSubmitting}
          >
            {t('task.delete.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
});
DeleteTaskModal.displayName = 'DeleteTaskModal';
