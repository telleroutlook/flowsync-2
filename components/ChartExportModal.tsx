import { useState } from 'react';
import { X, Download, FileJson, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { useChartExports } from '../src/hooks/useChartExports';
import type { ChartConfig } from '../types';

interface ChartExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  charts: ChartConfig[];
  projectName: string;
}

type ExportFormat = 'json' | 'pptx';

export function ChartExportModal({
  isOpen,
  onClose,
  projectId,
  charts,
  projectName,
}: ChartExportModalProps) {
  const { exportToJSON, exportToPPTX, isExporting, error } = useChartExports();
  const [format, setFormat] = useState<ExportFormat>('json');
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(new Set());
  const [exportedFile, setExportedFile] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleToggleChart = (chartId: string) => {
    const newSelected = new Set(selectedCharts);
    if (newSelected.has(chartId)) {
      newSelected.delete(chartId);
    } else {
      newSelected.add(chartId);
    }
    setSelectedCharts(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedCharts.size === charts.length) {
      setSelectedCharts(new Set());
    } else {
      setSelectedCharts(new Set(charts.map(c => c.id)));
    }
  };

  const handleExport = async () => {
    setExportedFile(null);

    try {
      if (format === 'json') {
        await exportToJSON(projectId);
        setExportedFile('JSON Bundle');
      } else if (format === 'pptx') {
        const selectedChartsData = charts
          .filter(c => selectedCharts.has(c.id))
          .map(c => ({
            id: c.id,
            title: c.title,
            description: c.description || undefined,
            echartsConfig: c.echartsConfig,
          }));
        await exportToPPTX(selectedChartsData);
        setExportedFile('PPTX');
      }
    } catch (err) {
      // Error is handled by the hook
      console.error('Export failed:', err);
    }
  };

  const hasSelection = format === 'json' || selectedCharts.size > 0;
  const isValid = hasSelection && !isExporting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">导出图表</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {projectName} · {charts.length} 个图表
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              导出格式
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat('json')}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                  format === 'json'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <FileJson className="w-6 h-6 text-blue-500" />
                <div className="text-left">
                  <div className="font-medium text-gray-900 dark:text-white">JSON Bundle</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    完整配置，可重新导入编辑
                  </div>
                </div>
              </button>

              <button
                onClick={() => setFormat('pptx')}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                  format === 'pptx'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <FileText className="w-6 h-5 text-purple-500" />
                <div className="text-left">
                  <div className="font-medium text-gray-900 dark:text-white">PowerPoint</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    PPTX 演示文稿（开发中）
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Chart Selection (for PPTX) */}
          {format === 'pptx' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  选择要导出的图表
                </label>
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {selectedCharts.size === charts.length ? '取消全选' : '全选'}
                </button>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-48 overflow-y-auto">
                {charts.map((chart) => (
                  <label
                    key={chart.id}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-900 border-b border-gray-200 dark:border-gray-700 last:border-b-0 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCharts.has(chart.id)}
                      onChange={() => handleToggleChart(chart.id)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {chart.title}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {chart.chartType}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Success Display */}
          {exportedFile && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  导出成功！
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  {exportedFile} 文件已开始下载
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            disabled={isExporting}
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={!isValid}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                导出
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
