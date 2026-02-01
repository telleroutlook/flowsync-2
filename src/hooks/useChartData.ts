import { useState, useEffect, useCallback } from 'react';
import type { ChartProject, ChartConfig, DataSource } from '../../types';

/**
 * Hook for managing chart data
 */
export function useChartData(workspaceId?: string) {
  const [chartProjects, setChartProjects] = useState<ChartProject[]>([]);
  const [charts, setCharts] = useState<Record<string, ChartConfig[]>>({});
  const [dataSources, setDataSources] = useState<Record<string, DataSource[]>>({});
  const [activeChartProjectId, setActiveChartProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all chart projects in workspace
   */
  const fetchChartProjects = useCallback(async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      setError(null);

      // TODO: Implement actual API call when chart-projects endpoint is ready
      // const response = await fetch(`/api/chart-projects?workspaceId=${workspaceId}`);
      // const data = await response.json();

      // Mock data for now
      const mockProjects: ChartProject[] = [];

      setChartProjects(mockProjects);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch chart projects';
      setError(message);
      console.error('fetchChartProjects error:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  /**
   * Create a new chart project
   */
  const createChartProject = useCallback(async (data: { name: string; description?: string }) => {
    if (!workspaceId) throw new Error('Workspace ID is required');

    try {
      setLoading(true);
      setError(null);

      // TODO: Implement actual API call
      // const response = await fetch('/api/chart-projects', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ workspaceId, name: data.name, description: data.description }),
      // });
      // const result = await response.json();

      // Mock response for now
      const mockProject: ChartProject = {
        id: crypto.randomUUID(),
        workspaceId,
        name: data.name,
        description: data.description || null,
        icon: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setChartProjects(prev => [...prev, mockProject]);
      return mockProject;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create chart project';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  /**
   * Delete a chart project
   */
  const deleteChartProject = useCallback(async (projectId: string) => {
    if (!workspaceId) throw new Error('Workspace ID is required');

    try {
      setLoading(true);
      setError(null);

      // TODO: Implement actual API call
      // await fetch(`/api/chart-projects/${projectId}?workspaceId=${workspaceId}`, {
      //   method: 'DELETE',
      // });

      setChartProjects(prev => prev.filter(p => p.id !== projectId));
      setCharts(prev => {
        const updated = { ...prev };
        delete updated[projectId];
        return updated;
      });
      setDataSources(prev => {
        const updated = { ...prev };
        delete updated[projectId];
        return updated;
      });

      if (activeChartProjectId === projectId) {
        setActiveChartProjectId(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete chart project';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [workspaceId, activeChartProjectId]);

  /**
   * Delete a chart
   */
  const deleteChart = useCallback(async (chartId: string, projectId: string) => {
    if (!workspaceId) throw new Error('Workspace ID is required');

    try {
      // TODO: Implement actual API call
      // await fetch(`/api/charts/${chartId}?workspaceId=${workspaceId}`, {
      //   method: 'DELETE',
      // });

      setCharts(prev => ({
        ...prev,
        [projectId]: (prev[projectId] || []).filter(c => c.id !== chartId),
      }));
    } catch (err) {
      console.error(`deleteChart error:`, err);
      throw err;
    }
  }, [workspaceId]);

  /**
   * Refresh all data
   */
  const refreshData = useCallback(() => {
    return fetchChartProjects();
  }, [fetchChartProjects]);

  // Auto-fetch on mount and workspace change
  useEffect(() => {
    if (workspaceId) {
      fetchChartProjects();
    } else {
      // Clear data when no workspace
      setChartProjects([]);
      setCharts({});
      setDataSources({});
      setActiveChartProjectId(null);
    }
  }, [workspaceId, fetchChartProjects]);

  /**
   * Get active chart project
   */
  const activeChartProject = chartProjects.find(p => p.id === activeChartProjectId) || null;

  /**
   * Get charts for active project
   */
  const activeCharts = activeChartProjectId ? (charts[activeChartProjectId] || []) : [];

  /**
   * Get data sources for active project
   */
  const activeDataSources = activeChartProjectId ? (dataSources[activeChartProjectId] || []) : [];

  return {
    // Data
    chartProjects,
    charts,
    dataSources,
    activeChartProject,
    activeCharts,
    activeDataSources,
    activeChartProjectId,
    loading,
    error,

    // Actions
    setActiveChartProjectId,
    createChartProject,
    deleteChartProject,
    deleteChart,
    refreshData,
  };
}
