import React, { useState } from 'react';
import {
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
} from 'lucide-react';
import type { ChartConfig } from '../types';

interface ChartGalleryProps {
  charts: ChartConfig[];
  onSelectChart: (chartId: string) => void;
  onDeleteChart: (chartId: string) => void;
  projectId: string;
}

export function ChartGallery({
  charts,
  onSelectChart,
  onDeleteChart,
}: ChartGalleryProps) {
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const toggleSelectChart = (chartId: string) => {
    const newSelected = new Set(selectedCharts);
    if (newSelected.has(chartId)) {
      newSelected.delete(chartId);
    } else {
      newSelected.add(chartId);
    }
    setSelectedCharts(newSelected);
  };

  const handleDeleteClick = (e: React.MouseEvent, chartId: string) => {
    e.stopPropagation();
    setShowDeleteConfirm(chartId);
  };

  const handleDeleteConfirm = (chartId: string) => {
    onDeleteChart(chartId);
    setShowDeleteConfirm(null);
    setSelectedCharts(prev => {
      const newSelected = new Set(prev);
      newSelected.delete(chartId);
      return newSelected;
    });
  };

  const getValidationIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'invalid':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getChartTypeColor = (chartType: string) => {
    const colors: Record<string, string> = {
      line: 'bg-blue-500',
      bar: 'bg-green-500',
      pie: 'bg-purple-500',
      scatter: 'bg-orange-500',
      map: 'bg-cyan-500',
      radar: 'bg-pink-500',
      gauge: 'bg-red-500',
      funnel: 'bg-indigo-500',
      heatmap: 'bg-amber-500',
      treemap: 'bg-teal-500',
      sankey: 'bg-lime-500',
      graph: 'bg-rose-500',
    };
    return colors[chartType] || 'bg-gray-500';
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">图表画廊</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {charts.length} 个图表
              {selectedCharts.size > 0 && ` · ${selectedCharts.size} 个已选择`}
            </p>
          </div>

          {selectedCharts.size > 0 && (
            <button
              onClick={() => setSelectedCharts(new Set())}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              取消选择
            </button>
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {charts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <BarChart3 className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无图表</p>
            <p className="text-sm mt-2">上传数据并使用 AI 生成图表</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {charts.map((chart) => (
              <div
                key={chart.id}
                className={`
                  group relative bg-white dark:bg-gray-800 rounded-lg border-2 transition-all
                  ${
                    selectedCharts.has(chart.id)
                      ? 'border-blue-500 shadow-lg'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                  cursor-pointer
                `}
                onClick={() => onSelectChart(chart.id)}
              >
                {/* Selection Checkbox */}
                <div
                  className="absolute top-3 left-3 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelectChart(chart.id);
                  }}
                >
                  <div
                    className={`
                      w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                      ${
                        selectedCharts.has(chart.id)
                          ? 'bg-blue-500 border-blue-500'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                      }
                    `}
                  >
                    {selectedCharts.has(chart.id) && (
                      <CheckCircle className="w-4 h-4 text-white" />
                    )}
                  </div>
                </div>

                {/* Chart Type Badge */}
                <div className={`absolute top-3 right-3 px-2 py-1 rounded-full ${getChartTypeColor(chart.chartType)} text-white text-xs font-medium`}>
                  {chart.chartType}
                </div>

                {/* Chart Preview */}
                <div className="aspect-video bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-t-lg flex items-center justify-center p-4">
                  <BarChart3 className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                </div>

                {/* Chart Info */}
                <div className="p-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate mb-1">
                    {chart.title}
                  </h3>
                  {chart.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                      {chart.description}
                    </p>
                  )}

                  {/* Validation Status */}
                  <div className="flex items-center gap-1 text-xs">
                    {getValidationIcon(chart.validationStatus)}
                    <span className="text-gray-600 dark:text-gray-400">
                      {chart.validationStatus === 'valid' && '已验证'}
                      {chart.validationStatus === 'invalid' && `${chart.validationErrors.length} 个错误`}
                      {chart.validationStatus === 'pending' && '待验证'}
                    </span>
                  </div>

                  {/* Metadata */}
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                      {chart.generatedBy === 'ai' ? 'AI 生成' : '手动创建'}
                    </span>
                    {chart.dataSourceId && (
                      <span>有数据源</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectChart(chart.id);
                    }}
                    className="p-2 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600"
                    title="查看详情"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>

                {/* Delete Button */}
                <button
                  onClick={(e) => handleDeleteClick(e, chart.id)}
                  className="absolute bottom-3 right-3 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除图表"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* Delete Confirmation */}
                {showDeleteConfirm === chart.id && (
                  <div className="absolute inset-0 bg-white dark:bg-gray-800 rounded-lg flex items-center justify-center z-20">
                    <div className="text-center px-4">
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">确认删除此图表?</p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleDeleteConfirm(chart.id)}
                          className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
                        >
                          删除
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
