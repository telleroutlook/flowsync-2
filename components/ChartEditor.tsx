import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Plus } from 'lucide-react';
import { ChartCanvas } from './ChartCanvas';
import { DataSourcePanel } from './DataSourcePanel';
import type { ChartConfig, DataSource } from '../types';

interface ChartEditorProps {
  workspaceId: string;
  projectId?: string;
}

type TabType = 'data' | 'charts';

export const ChartEditor: React.FC<ChartEditorProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<TabType>('data');
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);

  // State (would use custom hooks)
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<any>(null);

  // Load data
  const refresh = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      // Load charts
      const chartsRes = await fetch(`/api/charts/project/${projectId}`);
      if (chartsRes.ok) {
        const chartsData: { success: boolean; data: ChartConfig[] } = await chartsRes.json();
        if (chartsData.success) {
          setCharts(chartsData.data);
        }
      }

      // Load data sources
      const sourcesRes = await fetch(`/api/data-sources/project/${projectId}`);
      if (sourcesRes.ok) {
        const sourcesData: { success: boolean; data: DataSource[] } = await sourcesRes.json();
        if (sourcesData.success) {
          setDataSources(sourcesData.data);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    if (!projectId) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);

    const response = await fetch('/api/data-sources/upload', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      await refresh();
    } else {
      const errorData: { error?: { message?: string } } = await response.json();
      alert(errorData.error?.message || 'Upload failed');
    }
  }, [projectId, refresh]);

  // Handle delete data source
  const handleDeleteSource = useCallback(async (id: string) => {
    if (!confirm('确定要删除这个数据源吗？')) return;

    const response = await fetch(`/api/data-sources/${id}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      await refresh();
    }
  }, [refresh]);

  // Handle save chart
  const handleSaveChart = useCallback(async (config: Record<string, unknown>) => {
    if (!selectedChartId) return;

    const response = await fetch(`/api/charts/${selectedChartId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ echartsConfig: config }),
    });

    if (response.ok) {
      await refresh();
    }
  }, [selectedChartId, refresh]);

  const selectedChart = charts.find((c) => c.id === selectedChartId);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Projects List */}
      <div className="w-64 border-r border-border-subtle flex flex-col bg-surface">
        {/* Header */}
        <div className="p-4 border-b border-border-subtle">
          <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            ChartSync AI
          </h1>
        </div>

        {/* Projects */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs text-text-secondary uppercase tracking-wide mb-2 px-2">
            图表项目
          </div>
          {/* Would list projects here */}
          <div className="space-y-1">
            <div className="px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium text-sm">
              示例项目
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle">
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg border border-border-subtle hover:bg-surface transition-colors">
            <Plus className="w-4 h-4" />
            新建项目
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="h-14 border-b border-border-subtle flex items-center px-6 gap-2 bg-surface">
          {(['data', 'charts'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                px-4 py-2 rounded-lg font-medium text-sm transition-all
                ${activeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface'
                }
              `}
            >
              {tab === 'data' && '数据源'}
              {tab === 'charts' && '图表'}
            </button>
          ))}

          {/* Draft Indicator */}
          {pendingDraft && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="ml-auto px-3 py-1.5 bg-amber-500/10 text-amber-600 rounded-full text-xs font-medium"
            >
              待审批草稿
            </motion.div>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'data' && (
              <motion.div
                key="data"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="h-full"
              >
                <DataSourcePanel
                  dataSources={dataSources}
                  onUpload={handleFileUpload}
                  onDelete={handleDeleteSource}
                  loading={loading}
                />
              </motion.div>
            )}

            {activeTab === 'charts' && (
              <motion.div
                key="charts"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="h-full overflow-y-auto p-6"
              >
                {/* Charts Grid */}
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-text-primary mb-4">
                    图表 ({charts.length})
                  </h2>

                  {charts.length === 0 ? (
                    <div className="text-center py-16">
                      <BarChart3 className="w-16 h-16 mx-auto mb-4 text-text-tertiary" />
                      <p className="text-text-secondary mb-2">还没有图表</p>
                      <p className="text-sm text-text-tertiary">
                        上传数据源后，使用 AI 生成图表
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {charts.map((chart) => (
                        <motion.div
                          key={chart.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.02 }}
                          onClick={() => setSelectedChartId(chart.id)}
                          className={`
                            p-4 bg-surface rounded-lg border cursor-pointer
                            ${selectedChartId === chart.id
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-border-subtle hover:border-primary/50'
                            }
                          `}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-medium text-text-primary">{chart.title}</h3>
                              {chart.description && (
                                <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                                  {chart.description}
                                </p>
                              )}
                            </div>
                            <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                              {chart.chartType}
                            </span>
                          </div>

                          {/* Chart Thumbnail (simplified) */}
                          <div className="aspect-video bg-background rounded border border-border-subtle mb-3 flex items-center justify-center">
                            <BarChart3 className="w-8 h-8 text-text-tertiary" />
                          </div>

                          <div className="flex items-center justify-between text-xs text-text-secondary">
                            <span>
                              {chart.validationStatus === 'valid' && '✓ 已验证'}
                              {chart.validationStatus === 'invalid' && '⚠ 有错误'}
                              {chart.validationStatus === 'pending' && '待验证'}
                            </span>
                            <span>by {chart.generatedBy}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pending Draft Section */}
                {pendingDraft && (
                  <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-200 dark:border-amber-500/20">
                    <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
                      待审批草稿
                    </h3>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                      AI 生成了 {pendingDraft.actions?.length || 0} 个图表配置，是否批准？
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {/* Approve draft */}}
                        className="px-3 py-1.5 text-sm bg-success text-success-foreground rounded-lg hover:bg-success/90"
                      >
                        批准
                      </button>
                      <button
                        onClick={() => setPendingDraft(null)}
                        className="px-3 py-1.5 text-sm bg-critical text-critical-foreground rounded-lg hover:bg-critical/90"
                      >
                        拒绝
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Chart Preview Panel (Right Side) */}
      <AnimatePresence>
        {selectedChart && selectedChartId && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-[600px] border-l border-border-subtle"
          >
            <ChartCanvas
              chart={selectedChart}
              onClose={() => setSelectedChartId(null)}
              onSave={handleSaveChart}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
