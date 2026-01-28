/**
 * Global type extensions for FlowSync
 */
declare global {
  interface Window {
    /**
     * Global export dispatcher function exposed for console/debug use
     * @param format - Optional export format (defaults to last used format)
     */
    flowsyncExport?: (format?: 'csv' | 'pdf' | 'json' | 'markdown') => void;

    /**
     * Flag indicating the export dispatcher is ready
     */
    flowsyncExportReady?: boolean;
  }

  // Custom event for export triggering
  interface WindowEventMap {
    'flowsync:export': CustomEvent<{ format?: 'csv' | 'pdf' | 'json' | 'markdown' }>;
  }
}

export {};
