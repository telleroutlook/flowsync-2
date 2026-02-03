import { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { Button } from './ui/Button';
import { useI18n } from '../src/i18n';
import type { ConflictType, ConflictInfo } from '../worker/services/types';

/**
 * Re-export types from backend for consistency
 */
export type { ConflictType, ConflictInfo };

interface ConflictDialogProps {
  draftId: string;
  conflicts: ConflictInfo[];
  canAutoFix: boolean;
  onAutoFix: () => void;
  onForce: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export const ConflictDialog = memo<ConflictDialogProps>(({
  conflicts,
  canAutoFix,
  onAutoFix,
  onForce,
  onCancel,
  isProcessing,
}) => {
  const { t } = useI18n();

  const getConflictIcon = (type: ConflictType) => {
    switch (type) {
      case 'PREDECESSOR_CONFLICT':
      case 'DATE_ORDER_CONFLICT':
        return <AlertTriangle className="w-5 h-5 text-warning" />;
      case 'CONCURRENT_MODIFICATION':
        return <Info className="w-5 h-5 text-primary" />;
      case 'TASK_NOT_FOUND':
        return <XCircle className="w-5 h-5 text-critical" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-warning" />;
    }
  };

  const formatDate = (value: string) => value;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-text-primary/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-surface rounded-2xl shadow-float max-w-2xl w-full max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border-subtle">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-6 h-6 text-warning" />
            <h2 className="text-xl font-bold text-text-primary">
              {t('draft.conflict_detected', { defaultValue: '检测到冲突' })}
            </h2>
          </div>
          <p className="text-sm text-text-secondary">
            {t('draft.conflict_description', { defaultValue: '应用草稿时发现冲突。请选择如何处理。' })}
          </p>
        </div>

        {/* Conflicts List */}
        <div className="p-6 space-y-4">
          {conflicts.map((conflict, index) => (
            <div
              key={index}
              className="p-4 rounded-lg bg-background border border-border-subtle"
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {getConflictIcon(conflict.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary mb-1">
                    {conflict.message}
                  </p>

                  {conflict.canAutoFix && conflict.proposedFix && (
                    <div className="mt-2 p-3 rounded-md bg-success/10 border border-success/20">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span className="text-xs font-semibold text-success">
                          {t('draft.proposed_fix', { defaultValue: '建议修复' })}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">
                        {t('task.title', { defaultValue: '任务' })}: {conflict.proposedFix.title}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {t('task.start_date', { defaultValue: '开始日期' })}: {formatDate(conflict.proposedFix.startDate ?? conflict.proposedFix.createdAt)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {t('task.due_date', { defaultValue: '截止日期' })}: {formatDate(conflict.proposedFix.dueDate ?? conflict.proposedFix.createdAt)}
                      </p>
                    </div>
                  )}

                  {conflict.details && (
                    <details className="mt-2">
                      <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
                        {t('draft.show_details', { defaultValue: '显示详情' })}
                      </summary>
                      <pre className="mt-2 text-xs text-text-secondary overflow-auto bg-background p-2 rounded">
                        {JSON.stringify(conflict.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-border-subtle flex gap-3 justify-end flex-wrap">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 sm:flex-none min-w-[100px]"
          >
            {t('common.cancel', { defaultValue: '取消' })}
          </Button>

          {canAutoFix && (
            <Button
              variant="default"
              onClick={onAutoFix}
              disabled={isProcessing}
              isLoading={isProcessing}
              className="flex-1 sm:flex-none min-w-[140px] bg-success hover:bg-success/90 text-success-foreground"
            >
              {isProcessing
                ? t('common.processing', { defaultValue: '处理中...' })
                : t('draft.auto_fix_and_apply', { defaultValue: '自动修复并应用' })
              }
            </Button>
          )}

          <Button
            variant="default"
            onClick={onForce}
            disabled={isProcessing}
            isLoading={isProcessing}
            className="flex-1 sm:flex-none min-w-[100px]"
          >
            {isProcessing
              ? t('common.processing', { defaultValue: '处理中...' })
              : t('draft.force_apply', { defaultValue: '强制应用' })
            }
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
});

ConflictDialog.displayName = 'ConflictDialog';
