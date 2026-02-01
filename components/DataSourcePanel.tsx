import React, { useState } from 'react';
import { FileText, Trash2, Clock, Check, AlertCircle, Eye, Table } from 'lucide-react';
import { motion } from 'framer-motion';
import type { DataSource } from '../types';

interface DataSourcePanelProps {
  dataSources: DataSource[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loading?: boolean;
}

export const DataSourcePanel: React.FC<DataSourcePanelProps> = ({
  dataSources,
  onUpload,
  onDelete,
  loading = false,
}) => {
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (_type: string) => {
    return <FileText className="w-5 h-5" />;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <Check className="w-5 h-5 text-success" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-critical" />;
      default:
        return <Clock className="w-5 h-5 text-text-tertiary" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'success':
        return '解析成功';
      case 'failed':
        return '解析失败';
      default:
        return '等待解析';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-subtle">
        <h2 className="text-lg font-semibold text-text-primary">数据源管理</h2>
        <p className="text-sm text-text-secondary mt-1">
          上传数据文件以生成图表
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Upload Section */}
        <div className="mb-8">
          <div className="mb-4">
            <h3 className="text-sm font-medium text-text-primary mb-2">上传新文件</h3>
            <p className="text-xs text-text-secondary">
              支持 CSV、JSON、Excel (XLSX/XLS)、Markdown 格式
            </p>
          </div>

          <div
            className="border-2 border-dashed border-border-subtle rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer bg-surface"
            onClick={() => {
              // Trigger file input (would integrate with FileUploader)
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv,.json,.xlsx,.md';
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  await onUpload(file);
                }
              };
              input.click();
            }}
          >
            <Table className="w-8 h-8 mx-auto mb-3 text-text-secondary" />
            <p className="text-sm text-text-primary font-medium mb-1">点击或拖拽文件到此处</p>
            <p className="text-xs text-text-secondary">
              最大 10MB • 支持多种格式
            </p>
          </div>
        </div>

        {/* Data Sources List */}
        <div>
          <h3 className="text-sm font-medium text-text-primary mb-3">
            已上传文件 ({dataSources.length})
          </h3>

          {loading ? (
            <div className="text-center py-12 text-text-secondary">
              <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
              <p>加载数据源...</p>
            </div>
          ) : dataSources.length === 0 ? (
            <div className="text-center py-12">
              <Table className="w-12 h-12 mx-auto mb-3 text-text-tertiary" />
              <p className="text-text-secondary">暂无数据源</p>
              <p className="text-xs text-text-tertiary mt-1">上传文件开始创建图表</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dataSources.map((source) => (
                <motion.div
                  key={source.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`
                    p-4 bg-surface rounded-lg border transition-all cursor-pointer
                    ${selectedSource?.id === source.id
                      ? 'border-primary shadow-sm'
                      : 'border-border-subtle hover:border-border'
                    }
                  `}
                  onClick={() => setSelectedSource(source)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* File Icon */}
                      <div className="shrink-0 mt-0.5 text-text-secondary">
                        {getFileIcon(source.fileType)}
                      </div>

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-text-primary truncate">
                            {source.fileName}
                          </p>
                          {source.parseStatus === 'success' && (
                            <Check className="w-4 h-4 text-success shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                          <span className="uppercase">{source.fileType}</span>
                          <span>•</span>
                          <span>{formatFileSize(source.fileSize)}</span>
                          <span>•</span>
                          <span>{source.content?.metadata.rowCount || 0} 行</span>
                        </div>

                        {/* Error Message */}
                        {source.parseStatus === 'failed' && source.parseErrors && (
                          <p className="mt-2 text-xs text-critical bg-critical/10 px-2 py-1 rounded">
                            {source.parseErrors}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {source.parseStatus === 'success' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Show data preview modal (would implement)
                            }}
                            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface rounded"
                            title="预览数据"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(source.id);
                          }}
                          className="p-1.5 text-text-secondary hover:text-critical hover:bg-critical/10 rounded"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="mt-2 flex items-center gap-1.5 text-xs">
                      {getStatusIcon(source.parseStatus)}
                      <span className={`
                        ${source.parseStatus === 'success'
                          ? 'text-success'
                          : source.parseStatus === 'failed'
                            ? 'text-critical'
                            : 'text-text-tertiary'
                        }
                      `}>
                        {getStatusText(source.parseStatus)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Data Preview (when source selected) */}
      {selectedSource && selectedSource.parseStatus === 'success' && (
        <div className="border-t border-border-subtle">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-primary">数据预览</h3>
              <button
                onClick={() => setSelectedSource(null)}
                className="text-text-secondary hover:text-text-primary text-sm"
              >
                关闭
              </button>
            </div>

            {selectedSource.content && (
              <div className="bg-surface rounded-lg overflow-hidden border border-border-subtle">
                {/* Sample Data Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface">
                      <tr>
                        {selectedSource.content.metadata.columns.map((col) => (
                          <th
                            key={col}
                            className="px-3 py-2 text-left font-medium text-text-secondary border-b border-border-subtle whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSource.content?.metadata.sample.map((row, i) => (
                        <tr key={i} className="border-b border-border-subtle">
                          {selectedSource.content?.metadata.columns.map((col) => (
                            <td
                              key={col}
                              className="px-3 py-2 text-text-primary whitespace-nowrap"
                            >
                              {String(row[col] ?? '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Metadata */}
                <div className="px-3 py-2 bg-muted/30 text-xs text-text-secondary flex items-center justify-between">
                  <span>显示前 {selectedSource.content.metadata.sample.length} 行</span>
                  <span>共 {selectedSource.content.metadata.rowCount} 行</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
