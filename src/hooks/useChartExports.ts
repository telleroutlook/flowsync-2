import { useState, useCallback } from 'react';

/**
 * Hook for chart export operations
 */
export function useChartExports() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Export charts as JSON Bundle
   */
  const exportToJSON = useCallback(async (projectId: string) => {
    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch(`/api/chart-exports/json-bundle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || 'Export failed');
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'charts-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setError(message);
      throw err;
    } finally {
      setIsExporting(false);
    }
  }, []);

  /**
   * Export charts as PPTX
   * Note: This requires chart images to be rendered on client side first
   */
  const exportToPPTX = useCallback(async (_charts: Array<{
    id: string;
    title: string;
    description?: string;
    echartsConfig: Record<string, unknown>;
  }>) => {
    setIsExporting(true);
    setError(null);

    try {
      // For now, show not implemented message
      // In full implementation, this would:
      // 1. Render each chart to canvas using ECharts
      // 2. Convert to base64
      // 3. Send to backend for PPTX generation

      alert('PPT export will be implemented in the next phase.\n\nFor now, please use JSON export which includes all chart configurations.');
      throw new Error('PPT export not yet implemented');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PPT export failed';
      setError(message);
      throw err;
    } finally {
      setIsExporting(false);
    }
  }, []);

  /**
   * Import JSON Bundle
   */
  const importJSON = useCallback(async (file: File) => {
    setIsExporting(true);
    setError(null);

    try {
      const text = await file.text();
      const bundle = JSON.parse(text);

      const response = await fetch('/api/chart-imports/json-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || 'Import failed');
      }

      const result = await response.json() as { success: boolean; data: { imported: number; errors: string[]; projectId: string } };

      if (result.success && result.data.errors.length > 0) {
        console.warn('Import completed with errors:', result.data.errors);
      }

      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      throw err;
    } finally {
      setIsExporting(false);
    }
  }, []);

  return {
    exportToJSON,
    exportToPPTX,
    importJSON,
    isExporting,
    error,
  };
}
