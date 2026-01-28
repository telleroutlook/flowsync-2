import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiService } from '../../services/apiService';
import { AuditLog } from '../../types';
import { useI18n } from '../i18n';

interface UseAuditLogsProps {
  activeProjectId: string;
  refreshData: () => Promise<void>;
  appendSystemMessage: (text: string) => void;
}

interface AuditFilters {
  actor: string;
  action: string;
  entityType: string;
  q: string;
  from: string;
  to: string;
}

const DEFAULT_FILTERS: AuditFilters = {
  actor: 'all',
  action: 'all',
  entityType: 'all',
  q: '',
  from: '',
  to: '',
};

export const useAuditLogs = ({ activeProjectId, refreshData, appendSystemMessage }: UseAuditLogsProps) => {
  const { t } = useI18n();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(8);
  const [auditFilters, setAuditFilters] = useState<AuditFilters>(DEFAULT_FILTERS);

  // Memoize filter values to use as dependencies
  const filterValues = useMemo(
    () => ({
      actor: auditFilters.actor,
      action: auditFilters.action,
      entityType: auditFilters.entityType,
      q: auditFilters.q.trim(),
      from: auditFilters.from,
      to: auditFilters.to,
    }),
    [auditFilters]
  );

  const refreshAuditLogs = useCallback(async (projectId?: string, pageOverride?: number, pageSizeOverride?: number) => {
    const targetProjectId = projectId || activeProjectId;
    if (!targetProjectId) {
      setAuditLogs([]);
      setAuditTotal(0);
      return;
    }
    try {
      setIsAuditLoading(true);
      setAuditError(null);

      const from = filterValues.from ? new Date(`${filterValues.from}T00:00:00`).getTime() : undefined;
      const to = filterValues.to ? new Date(`${filterValues.to}T23:59:59`).getTime() : undefined;

      const result = await apiService.listAuditLogs({
        projectId: targetProjectId,
        page: pageOverride ?? auditPage,
        pageSize: pageSizeOverride ?? auditPageSize,
        actor: filterValues.actor === 'all' ? undefined : filterValues.actor,
        action: filterValues.action === 'all' ? undefined : filterValues.action,
        entityType: filterValues.entityType === 'all' ? undefined : filterValues.entityType,
        q: filterValues.q || undefined,
        from,
        to,
      });

      setAuditLogs(result.data);
      setAuditTotal(result.total);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : t('error.load_audit'));
    } finally {
      setIsAuditLoading(false);
    }
  }, [activeProjectId, auditPage, auditPageSize, filterValues, t]);

  // Reset page when filters or page size changes
  useEffect(() => {
    setAuditPage(1);
  }, [auditFilters, auditPageSize]);

  // Debounced refresh for search input to reduce API calls
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void refreshAuditLogs(activeProjectId);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [refreshAuditLogs, activeProjectId]);

  return {
    auditLogs,
    auditTotal,
    isAuditLoading,
    auditError,
    auditPage,
    setAuditPage,
    auditPageSize,
    setAuditPageSize,
    auditFilters,
    setAuditFilters,
    refreshAuditLogs,
  };
};
