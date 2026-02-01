import { useState, useCallback } from 'react';

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

interface GenerateChartsOptions {
  dataSourceId: string;
  projectId: string;
  prompt: string;
  chartCount?: number;
}

interface ModifyChartOptions {
  chartId: string;
  message: string;
  history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

/**
 * Hook for AI chart generation and modification
 */
export function useAIChart() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generate charts using AI
   */
  const generateCharts = useCallback(async (options: GenerateChartsOptions) => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/chart-ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataSourceId: options.dataSourceId,
          projectId: options.projectId,
          prompt: options.prompt,
          chartCount: options.chartCount || 1,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || 'Failed to generate charts');
      }

      const result = await response.json() as { success: boolean; data: ChartDraft };

      if (!result.success || !result.data) {
        throw new Error('Generation failed');
      }

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate charts';
      setError(message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /**
   * Modify existing chart using AI chat
   */
  const modifyChart = useCallback(async (options: ModifyChartOptions) => {
    setIsModifying(true);
    setError(null);

    try {
      const response = await fetch('/api/chart-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chartId: options.chartId,
          message: options.message,
          history: options.history || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || 'Failed to modify chart');
      }

      const result = await response.json() as { success: boolean; data: ChartDraft };

      if (!result.success || !result.data) {
        throw new Error('Modification failed');
      }

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to modify chart';
      setError(message);
      throw err;
    } finally {
      setIsModifying(false);
    }
  }, []);

  return {
    generateCharts,
    modifyChart,
    isGenerating,
    isModifying,
    error,
  };
}
