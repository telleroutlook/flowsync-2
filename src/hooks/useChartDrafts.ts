import { useState, useCallback, useEffect } from 'react';

export interface ChartDraft {
  id: string;
  projectId: string;
  dataSourceId: string | null;
  prompt: string;
  charts: Array<{
    id: string;
    title: string;
    description?: string;
    chartType: string;
    echartsConfig: Record<string, unknown>;
  }>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  updatedAt: number;
}

/**
 * Hook for chart draft management
 */
export function useChartDrafts(projectId?: string) {
  const [drafts, setDrafts] = useState<ChartDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch pending drafts for a project
   */
  const refreshDrafts = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/chart-drafts?projectId=${projectId}`);

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || 'Failed to fetch drafts');
      }

      const result = await response.json() as { success: boolean; data: ChartDraft[] };

      if (result.success) {
        setDrafts(result.data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch drafts';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  /**
   * Approve a draft (create actual charts from draft)
   */
  const approveDraft = useCallback(async (draftId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/chart-drafts/${draftId}/approve`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || 'Failed to approve draft');
      }

      const result = await response.json() as { success: boolean; data: { imported: number; projectId: string } };

      // Remove approved draft from list
      setDrafts(prev => prev.filter(d => d.id !== draftId));

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve draft';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Reject a draft
   */
  const rejectDraft = useCallback(async (draftId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/chart-drafts/${draftId}/reject`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || 'Failed to reject draft');
      }

      // Remove rejected draft from list
      setDrafts(prev => prev.filter(d => d.id !== draftId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject draft';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-refresh drafts when projectId changes
  useEffect(() => {
    refreshDrafts();
  }, [refreshDrafts]);

  return {
    drafts,
    pendingDrafts: drafts.filter(d => d.status === 'pending'),
    isLoading,
    error,
    refreshDrafts,
    approveDraft,
    rejectDraft,
  };
}
