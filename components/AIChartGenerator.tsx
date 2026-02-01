import { useState } from 'react';
import { X, Wand2, Loader2, Database } from 'lucide-react';
import { useAIChart } from '../src/hooks/useAIChart';
import type { DataSource } from '../types';

interface AIChartGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  dataSources: DataSource[];
  onGenerated?: (draftId: string) => void;
}

export function AIChartGenerator({ isOpen, onClose, projectId, dataSources, onGenerated }: AIChartGeneratorProps) {
  if (!isOpen) return null;
  const { generateCharts, isGenerating, error } = useAIChart();
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [chartCount, setChartCount] = useState(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDataSourceId || !prompt.trim()) {
      return;
    }

    try {
      const draft = await generateCharts({
        dataSourceId: selectedDataSourceId,
        projectId,
        prompt: prompt.trim(),
        chartCount,
      });

      onGenerated?.(draft.id);

      // Reset form
      setPrompt('');
      setChartCount(1);
      setSelectedDataSourceId('');
    } catch (err) {
      // Error is handled by the hook
      console.error('Generation failed:', err);
    }
  };

  const isValid = selectedDataSourceId && prompt.trim().length > 0 && !isGenerating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI 图表生成器</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                选择数据源并描述您想要的图表
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-4" data-ai-generator>
        {/* Data Source Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            数据源
          </label>
          {dataSources.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <Database className="w-4 h-4" />
              <span>暂无数据源，请先上传数据文件</span>
            </div>
          ) : (
            <select
              value={selectedDataSourceId}
              onChange={(e) => setSelectedDataSourceId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isGenerating}
            >
              <option value="">选择数据源...</option>
              {dataSources.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.fileName} ({ds.fileType.toUpperCase()})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Chart Count */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            生成图表数量
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={chartCount}
            onChange={(e) => setChartCount(parseInt(e.target.value) || 1)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isGenerating}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            AI 将根据您的描述生成 {chartCount} 个不同类型的图表
          </p>
        </div>

        {/* Prompt Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            描述您想要的图表
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：创建一个销售数据的折线图，显示每月的收入趋势，并添加一个饼图展示各产品类别的占比..."
            rows={4}
            maxLength={2000}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={isGenerating}
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              AI 会自动选择最合适的图表类型（折线图、柱状图、饼图等）
            </p>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {prompt.length} / 2000
            </span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
      </form>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            disabled={isGenerating}
          >
            取消
          </button>
          <button
            onClick={() => {
              if (isValid) {
                const form = document.querySelector('form[data-ai-generator]') as HTMLFormElement;
                form?.requestSubmit();
              }
            }}
            disabled={!isValid}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                生成图表
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
