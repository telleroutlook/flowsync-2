import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as echarts from 'echarts';
import { X, Download, RefreshCw, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ChartConfig {
  id: string;
  title: string;
  description: string | null;
  chartType: string;
  echartsConfig: Record<string, unknown>;
  validationStatus: 'valid' | 'invalid' | 'pending';
  validationErrors?: Array<{ message: string; path?: string }>;
}

interface ChartCanvasProps {
  chart: ChartConfig;
  onClose?: () => void;
  onSave?: (config: Record<string, unknown>) => Promise<void>;
  editable?: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const ChartCanvas: React.FC<ChartCanvasProps> = ({
  chart,
  onClose,
  onSave,
  editable = true,
  fullscreen = false,
  onToggleFullscreen,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>(chart.echartsConfig);
  const [validationErrors, setValidationErrors] = useState<Array<{ message: string; path?: string }>>(
    chart.validationErrors || []
  );
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize ECharts instance
  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize chart
    chartInstance.current = echarts.init(chartRef.current, '', {
      renderer: 'canvas', // Use canvas for better performance
      devicePixelRatio: window.devicePixelRatio || 1,
    });

    chartInstance.current.setOption(config);

    // Responsive resize
    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, []);

  // Update chart when config changes
  useEffect(() => {
    if (chartInstance.current) {
      try {
        chartInstance.current.setOption(config, true);
      } catch (error) {
        console.error('Failed to update chart:', error);
      }
    }
  }, [config]);

  // Sync with external chart updates
  useEffect(() => {
    if (chart.echartsConfig !== config) {
      setConfig(chart.echartsConfig);
      setValidationErrors(chart.validationErrors || []);
      setHasChanges(false);
    }
  }, [chart.id, chart.echartsConfig, chart.validationErrors]);

  // Validate chart configuration
  const validateChart = useCallback(async () => {
    setIsValidating(true);
    try {
      const response = await fetch(`/api/charts/${chart.id}/validate`, {
        method: 'POST',
      });
      const result = await response.json() as {
        success: boolean;
        data: { errors?: Array<{ message: string; path?: string }> };
      };

      if (result.success) {
        setValidationErrors(result.data.errors || []);
      }
    } catch (error) {
      console.error('Validation failed:', error);
    } finally {
      setIsValidating(false);
    }
  }, [chart.id]);

  // Export chart as image
  const exportImage = useCallback(async (format: 'png' | 'svg' = 'png') => {
    if (!chartInstance.current) return;

    const url = chartInstance.current.getDataURL({
      type: format === 'svg' ? 'svg' : 'png',
      pixelRatio: 2,
      backgroundColor: '#fff',
    });

    const link = document.createElement('a');
    link.download = `${chart.title}.${format}`;
    link.href = url;
    link.click();
  }, [chart.title]);

  // Save chart configuration
  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      await onSave(config);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save chart:', error);
    } finally {
      setIsSaving(false);
    }
  }, [config, onSave]);

  const hasErrors = validationErrors.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={`
        flex flex-col bg-surface border-l border-border-subtle
        ${fullscreen ? 'fixed inset-0 z-50' : 'w-[500px]'}
      `}
    >
      {/* Header */}
      <div className="h-14 px-4 border-b border-border-subtle flex items-center justify-between bg-surface">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary truncate">{chart.title}</h3>
          {chart.description && (
            <p className="text-xs text-text-secondary truncate">{chart.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="text-text-secondary hover:text-text-primary p-1 rounded hover:bg-surface"
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary p-1 rounded hover:bg-surface"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Validation Errors */}
      <AnimatePresence>
        {hasErrors && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 bg-critical/10 border-b border-critical/20"
          >
            <div className="py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-critical shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-critical">图表配置存在错误</p>
                <div className="mt-1 space-y-1">
                  {validationErrors.slice(0, 3).map((error, i) => (
                    <p key={i} className="text-xs text-critical/80">
                      {error.path && <span className="font-mono">{error.path}: </span>}
                      {error.message}
                    </p>
                  ))}
                  {validationErrors.length > 3 && (
                    <p className="text-xs text-critical/70">
                      ...还有 {validationErrors.length - 3} 个错误
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chart Canvas */}
      <div className="flex-1 p-4 bg-background overflow-auto">
        <div
          ref={chartRef}
          className="w-full min-h-[400px]"
          style={{ height: fullscreen ? 'calc(100vh - 200px)' : 'auto' }}
        />
      </div>

      {/* Toolbar */}
      {editable && (
        <div className="px-4 py-3 border-t border-border-subtle flex items-center gap-2 bg-surface">
          <button
            onClick={validateChart}
            disabled={isValidating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-subtle hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />
            验证
          </button>

          <button
            onClick={() => exportImage('png')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-subtle hover:bg-surface"
          >
            <Download className="w-4 h-4" />
            导出 PNG
          </button>

          <button
            onClick={() => exportImage('svg')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border-subtle hover:bg-surface"
          >
            <Download className="w-4 h-4" />
            导出 SVG
          </button>

          <div className="flex-1" />

          {hasChanges && onSave && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      )}

      {/* Config JSON Viewer (Debug) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="px-4 py-2 border-t border-border-subtle">
          <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
            配置 JSON (开发模式)
          </summary>
          <pre className="mt-2 text-xs bg-surface p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(config, null, 2)}
          </pre>
        </details>
      )}
    </motion.div>
  );
};
