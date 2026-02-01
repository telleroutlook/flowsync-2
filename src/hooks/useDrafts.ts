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
  appendModelMessage: (text: string) => void;
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

export const useDrafts = ({ activeProjectId, refreshData, refreshAuditLogs, appendSystemMessage, appendModelMessage, onProjectModified }: UseDraftsProps) => {
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
      console.log('[submitDraft] Creating draft', {
        actionCount: actions.length,
        actions: actions.map(a => ({ type: `${a.entityType}.${a.action}`, id: a.entityId }))
      });

      const result = await apiService.createDraft({
        projectId: activeProjectId || undefined,
        createdBy: options.createdBy,
        reason: options.reason,
        actions,
      });

      console.log('[submitDraft] Draft created', {
        draftId: result.draft.id,
        workspaceId: result.draft.workspaceId,
        actionCount: result.draft.actions.length,
        warnings: result.warnings
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
    console.log('[handleApplyDraft] Called with draftId:', draftId);
    console.log('[handleApplyDraft] pendingDraft:', pendingDraft);
    console.log('[handleApplyDraft] All drafts:', drafts.map(d => ({ id: d.id, status: d.status })));

    // Prevent duplicate operations
    if (draftOperationRef.current.has(draftId)) {
      console.log('[handleApplyDraft] Skipping - already processing');
      return;
    }
    draftOperationRef.current.add(draftId);

    try {
      setIsProcessingDraft(true);

      // FIX: Only apply the specific draft that was clicked, not all pending drafts
      // This is the correct behavior - apply only what the user approved
      const targetIds = [draftId];
      let projectModified = false;

      for (const id of targetIds) {
        console.log('[handleApplyDraft] Applying draft', {
          draftId: id,
          workspaceId: drafts.find(d => d.id === id)?.workspaceId,
        });

        const draft = drafts.find(d => d.id === id);
        const result = await apiService.applyDraft(id, 'user', draft?.workspaceId);

        console.log('[handleApplyDraft] Draft applied with result', {
          draftId: id,
          resultStatus: result.draft.status,
          resultsCount: result.results?.length,
          summary: result.draft.summary,
        });

        setDrafts(prev => {
          const exists = prev.some(draft => draft.id === result.draft.id);
          if (!exists) return [...prev, result.draft];
          return prev.map(draft => (draft.id === result.draft.id ? result.draft : draft));
        });
        if (draft?.actions.some(a => a.entityType === 'project')) {
          projectModified = true;
        }

        // Handle different draft statuses with user-friendly messages
        if (result.draft.status === 'applied') {
          // Simple success: use system message (not rendered)
          appendSystemMessage(t('draft.applied', { id }));
        } else if (result.draft.status === 'partial') {
          // Partial success: use AI-style message with Markdown formatting
          const summary = result.draft.summary;
          const results = result.results ?? [];
          const failedActions = results.filter(a => a.status === 'failed');
          const warningActions = results.filter(a => a.status === 'warning');
          const successActions = results.filter(a => a.status === 'success');

          // Build formatted Markdown message
          let markdownMessage = `## ${t('draft.partial_applied_title')}\n\n`;

          // Summary section
          markdownMessage += `**${t('draft.summary')}**\n`;
          markdownMessage += `- ✅ ${t('draft.success_count', { count: summary?.success ?? successActions.length })}\n`;
          if (summary?.warning ?? warningActions.length > 0) {
            markdownMessage += `- ⚠️ ${t('draft.warning_count', { count: summary?.warning ?? warningActions.length })}\n`;
          }
          if (summary?.failed ?? failedActions.length > 0) {
            markdownMessage += `- ❌ ${t('draft.failed_count', { count: summary?.failed ?? failedActions.length })}\n`;
          }
          if (summary?.skipped ?? 0) {
            markdownMessage += `- ⏭️ ${t('draft.skipped_count', { count: summary?.skipped ?? 0 })}\n`;
          }
          markdownMessage += `\n`;

          // Failed actions section
          if (failedActions.length > 0) {
            markdownMessage += `### ${t('draft.failed_actions_title')}\n\n`;
            for (const action of failedActions) {
              const entity = action.after?.title || action.after?.name || action.entityId || action.id || 'Unknown';
              const error = action.error || t('common.unknown_error');
              markdownMessage += `**${action.entityType}.${action.action}(${entity})**\n\n`;
              markdownMessage += `\`\`\`\n${error}\n\`\`\`\n\n`;
            }
          }

          // Warnings section
          if (warningActions.length > 0 && failedActions.length === 0) {
            markdownMessage += `### ${t('draft.warnings_title')}\n\n`;
            markdownMessage += `${t('draft.warnings_auto_corrected')}\n\n`;
          }

          // Use AI-style rendering for better UX
          appendModelMessage(markdownMessage);
        } else if (result.draft.status === 'failed') {
          // Complete failure: use AI-style message with details
          const summary = result.draft.summary;
          const results = result.results ?? [];
          const failedActions = results.filter(a => a.status === 'failed');

          let markdownMessage = `## ${t('draft.apply_failed_title')}\n\n`;

          if (summary) {
            markdownMessage += `**${t('draft.execution_summary')}**\n`;
            markdownMessage += `- ✅ ${t('draft.success_count', { count: summary.success })}\n`;
            if (summary.warning > 0) {
              markdownMessage += `- ⚠️ ${t('draft.warning_count', { count: summary.warning })}\n`;
            }
            markdownMessage += `- ❌ ${t('draft.failed_count', { count: summary.failed })}\n`;
            if (summary.skipped > 0) {
              markdownMessage += `- ⏭️ ${t('draft.skipped_count', { count: summary.skipped })}\n`;
            }
            markdownMessage += `\n`;
          } else if (failedActions.length > 0) {
            // Fallback: show count from failedActions if summary is missing
            markdownMessage += `**${t('draft.execution_summary')}**\n`;
            markdownMessage += `- ❌ ${t('draft.failed_count', { count: failedActions.length })}\n`;
            markdownMessage += `\n`;
          }

          if (failedActions.length > 0) {
            markdownMessage += `### ${t('draft.failed_actions_title')}\n\n`;
            for (const action of failedActions) {
              const entity = action.after?.title || action.after?.name || action.entityId || action.id || 'Unknown';
              const error = action.error || t('common.unknown_error');
              markdownMessage += `**${action.entityType}.${action.action}(${entity})**\n\n`;
              markdownMessage += `\`\`\`\n${error}\n\`\`\`\n\n`;
            }
          } else if (results.length > 0) {
            // Edge case: we have results but no failed actions
            // This can happen if results don't have proper status fields
            markdownMessage += `### ${t('draft.failed_actions_title')}\n\n`;
            markdownMessage += `⚠️ ${t('draft.error_details_missing', {
              count: results.length,
              draftId: result.draft.id,
            })}\n\n`;
          } else {
            markdownMessage += `${t('draft.unknown_error')}\n`;
          }

          // Use AI-style rendering for better UX
          appendModelMessage(markdownMessage);
        }
      }

      setPendingDraftId(null);
      if (projectModified) {
        onProjectModified?.();
      }
      await refreshData();
      await refreshDrafts();
      await refreshAuditLogs(activeProjectId);
    } catch (error) {
      console.error('[handleApplyDraft] Draft apply failed', {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      appendSystemMessage(t('draft.apply_failed', { error: getErrorMessage(error, t('common.na')) }));
      // Re-throw error to ensure caller knows operation failed
      throw error;
    } finally {
      // Only remove from tracking set after all operations complete
      // This prevents race conditions where the same draftId could be processed again
      draftOperationRef.current.delete(draftId);
      setIsProcessingDraft(false);
    }
  }, [drafts, refreshData, refreshDrafts, refreshAuditLogs, activeProjectId, appendSystemMessage, appendModelMessage, onProjectModified, t]);

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
