import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiService } from '../../services/apiService';
import { Draft, DraftAction } from '../../types';
import { useI18n } from '../i18n';
import { getErrorMessage } from '../utils/error';

interface UseDraftsProps {
  activeProjectId: string;
  refreshData: () => Promise<void>;
  refreshAuditLogs: (projectId?: string) => Promise<void>;
  appendSystemMessage: (text: string) => void;
  onProjectModified?: () => void;
}

interface UseDraftsResult {
  drafts: Draft[];
  pendingDraft: Draft | null;
  pendingDraftId: string | null;
  setPendingDraftId: (id: string | null) => void;
  draftWarnings: string[];
  isProcessingDraft: boolean;
  refreshDrafts: () => Promise<void>;
  submitDraft: (
    actions: DraftAction[],
    options: { reason?: string; createdBy: Draft['createdBy']; autoApply?: boolean; silent?: boolean }
  ) => Promise<Draft>;
  handleApplyDraft: (draftId: string) => Promise<void>;
  handleDiscardDraft: (draftId: string) => Promise<void>;
}

export const useDrafts = ({ activeProjectId, refreshData, refreshAuditLogs, appendSystemMessage, onProjectModified }: UseDraftsProps) => {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [isProcessingDraft, setIsProcessingDraft] = useState(false);

  // Track draft operations to prevent race conditions
  const draftOperationRef = useRef<Set<string>>(new Set());

  const pendingDraft = useMemo(
    () => drafts.find(draft => draft.id === pendingDraftId) || null,
    [drafts, pendingDraftId]
  );

  const refreshDrafts = useCallback(async (): Promise<void> => {
    try {
      const items = await apiService.listDrafts();
      setDrafts(items);
      setPendingDraftId(prevId => {
        if (prevId && !items.find(item => item.id === prevId && item.status === 'pending')) {
          return null;
        }
        return prevId;
      });
    } catch (error) {
      // Non-critical operation, but log for debugging
      console.error('Draft refresh failed (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshDrafts();
  }, [refreshDrafts]);

  const submitDraft = useCallback(async (
    actions: DraftAction[],
    options: { reason?: string; createdBy: Draft['createdBy']; autoApply?: boolean; silent?: boolean }
  ): Promise<Draft> => {
    try {
      const result = await apiService.createDraft({
        projectId: activeProjectId || undefined,
        createdBy: options.createdBy,
        reason: options.reason,
        actions,
      });
      
      setDraftWarnings(result.warnings);
      
      if (result.warnings.length > 0 && !options.silent) {
        appendSystemMessage(t('draft.warnings', { warnings: result.warnings.join(' | ') }));
      }
      
      setDrafts(prev => [...prev, result.draft]);
      
      if (options.autoApply) {
        const applied = await apiService.applyDraft(result.draft.id, options.createdBy, result.draft.workspaceId);
        setDrafts(prev => prev.map(draft => (draft.id === applied.draft.id ? applied.draft : draft)));
        // Invalidate project cache if any project actions were applied
        if (result.draft.actions.some(a => a.entityType === 'project')) {
          onProjectModified?.();
        }
        await refreshData();
        await refreshAuditLogs(activeProjectId);
        if (!options.silent) {
          appendSystemMessage(t('draft.applied', { id: applied.draft.id }));
        }
        return applied.draft;
      }
      
      setPendingDraftId(result.draft.id);
      if (!options.silent) {
        appendSystemMessage(t('draft.created', { id: result.draft.id }));
      }
      return result.draft;
    } catch (error) {
      const msg = getErrorMessage(error, t('draft.submit_failed'));
      if (!options.silent) appendSystemMessage(t('chat.error_prefix', { error: msg }));
      throw error;
    }
  }, [activeProjectId, refreshData, refreshAuditLogs, appendSystemMessage, onProjectModified, t]);

  const handleApplyDraft = useCallback(async (draftId: string) => {
    // Prevent duplicate operations
    if (draftOperationRef.current.has(draftId)) {
      return;
    }
    draftOperationRef.current.add(draftId);

    try {
      setIsProcessingDraft(true);

      const pendingDrafts = drafts.filter(draft => draft.status === 'pending');
      const targetIds = pendingDrafts.length > 0
        ? pendingDrafts.map(draft => draft.id)
        : [draftId];
      const uniqueIds = Array.from(new Set(targetIds));
      let projectModified = false;

      for (const id of uniqueIds) {
        const draft = drafts.find(d => d.id === id);
        const result = await apiService.applyDraft(id, 'user', draft?.workspaceId);
        setDrafts(prev => {
          const exists = prev.some(draft => draft.id === result.draft.id);
          if (!exists) return [...prev, result.draft];
          return prev.map(draft => (draft.id === result.draft.id ? result.draft : draft));
        });
        if (draft?.actions.some(a => a.entityType === 'project')) {
          projectModified = true;
        }
        appendSystemMessage(t('draft.applied', { id }));
      }

      setPendingDraftId(null);
      if (projectModified) {
        onProjectModified?.();
      }
      await refreshData();
      await refreshDrafts();
      await refreshAuditLogs(activeProjectId);
    } catch (error) {
      appendSystemMessage(t('draft.apply_failed', { error: getErrorMessage(error, t('common.na')) }));
    } finally {
      draftOperationRef.current.delete(draftId);
      setIsProcessingDraft(false);
    }
  }, [drafts, refreshData, refreshDrafts, refreshAuditLogs, activeProjectId, appendSystemMessage, onProjectModified, t]);

  const handleDiscardDraft = useCallback(async (draftId: string) => {
    try {
      const result = await apiService.discardDraft(draftId);
      setDrafts(prev => prev.map(draft => (draft.id === result.id ? result : draft)));
      setPendingDraftId(prev => (prev === draftId ? null : prev));
      await refreshDrafts();
      appendSystemMessage(t('draft.discarded', { id: draftId }));
    } catch (error) {
      appendSystemMessage(t('draft.discard_failed', { error: getErrorMessage(error, t('common.na')) }));
    }
  }, [refreshDrafts, appendSystemMessage, t]);

  return {
    drafts,
    pendingDraft,
    pendingDraftId,
    setPendingDraftId,
    draftWarnings,
    isProcessingDraft,
    refreshDrafts,
    submitDraft,
    handleApplyDraft,
    handleDiscardDraft
  } satisfies UseDraftsResult;
};
