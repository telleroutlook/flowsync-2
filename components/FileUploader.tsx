import React, { useCallback, useState } from 'react';
import { Upload, X, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FileUploaderProps {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  maxSize?: number; // in bytes
  disabled?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onUpload,
  accept = '.csv,.json,.xlsx,.md',
  maxSize = 10 * 1024 * 1024, // 10MB
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (!file) return;

      await processFile(file);
    },
    [disabled]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await processFile(file);
      }
      // Reset input
      if (e.target) {
        e.target.value = '';
      }
    },
    []
  );

  const processFile = async (file: File) => {
    // Validate file size
    if (file.size > maxSize) {
      setUploadStatus({
        type: 'error',
        message: `文件大小超过 ${(maxSize / 1024 / 1024).toFixed(0)}MB 限制`,
      });
      return;
    }

    // Validate file type
    const ext = '.' + file.name.split('.').pop();
    const acceptedExtensions = accept.split(',').map((e) => e.trim());
    if (!acceptedExtensions.includes(ext.toLowerCase())) {
      setUploadStatus({
        type: 'error',
        message: `不支持的文件格式: ${ext}`,
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      await onUpload(file);
      setUploadStatus({
        type: 'success',
        message: `成功上传: ${file.name}`,
      });
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error instanceof Error ? error.message : '上传失败',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-primary bg-primary/5 scale-105'
            : 'border-border-subtle hover:border-primary/50 hover:bg-surface'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={handleFileSelect}
          disabled={disabled}
        />

        {/* Upload Icon */}
        <motion.div
          initial={{ scale: 1 }}
          animate={{ scale: isDragging ? 1.1 : 1 }}
          className="flex justify-center mb-4"
        >
          <div className={`
            w-16 h-16 rounded-full flex items-center justify-center
            ${isDragging ? 'bg-primary text-primary-foreground' : 'bg-surface'}
          `}>
            {isUploading ? (
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-8 h-8" />
            )}
          </div>
        </motion.div>

        {/* Text Content */}
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          {isUploading ? '上传中...' : '拖拽或点击上传文件'}
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          支持 CSV、JSON、Excel、Markdown 格式，最大 {(maxSize / 1024 / 1024).toFixed(0)}MB
        </p>

        {!disabled && (
          <button
            type="button"
            className="px-4 py-2 text-sm rounded-lg border border-border-subtle hover:bg-surface transition-colors"
            disabled={isUploading}
          >
            选择文件
          </button>
        )}
      </div>

      {/* Status Messages */}
      <AnimatePresence>
        {uploadStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4"
          >
            <div
              className={`
                flex items-center gap-3 p-3 rounded-lg
                ${uploadStatus.type === 'success'
                  ? 'bg-success/10 text-success'
                  : uploadStatus.type === 'error'
                    ? 'bg-critical/10 text-critical'
                    : 'bg-info/10 text-info'
                }
              `}
            >
              {uploadStatus.type === 'success' && <Check className="w-5 h-5 shrink-0" />}
              {uploadStatus.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{uploadStatus.message}</p>
              </div>
              <button
                onClick={() => setUploadStatus(null)}
                className="shrink-0 hover:opacity-70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
