import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Chart Audit Log Types
 */
export interface ChartAuditLog {
  id: string;
  workspaceId: string;
  entityType: 'chart_project' | 'chart_config' | 'data_source';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'export' | 'validate';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: 'user' | 'ai' | 'system';
  reason: string | null;
  timestamp: number;
  projectId: string | null;
  draftId: string | null;
}

interface UseAuditLogsProps {
  activeProjectId: string;
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

const ENTITY_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'chart_project', label: '图表项目' },
  { value: 'chart_config', label: '图表配置' },
  { value: 'data_source', label: '数据源' },
];

const ACTION_TYPE_OPTIONS = [
  { value: 'all', label: '全部操作' },
  { value: 'create', label: '创建' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'export', label: '导出' },
  { value: 'validate', label: '校验' },
];

const ACTOR_TYPE_OPTIONS = [
  { value: 'all', label: '全部来源' },
  { value: 'user', label: '用户' },
  { value: 'ai', label: 'AI' },
  { value: 'system', label: '系统' },
];

export const useAuditLogs = ({ activeProjectId }: UseAuditLogsProps) => {
  const [auditLogs, setAuditLogs] = useState<ChartAuditLog[]>([]);
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

      // Build query parameters
      const params = new URLSearchParams({
        projectId: targetProjectId,
        page: String(pageOverride ?? auditPage),
        pageSize: String(pageSizeOverride ?? auditPageSize),
      });

      if (filterValues.actor !== 'all') params.append('actor', filterValues.actor);
      if (filterValues.action !== 'all') params.append('action', filterValues.action);
      if (filterValues.entityType !== 'all') params.append('entityType', filterValues.entityType);
      if (filterValues.q) params.append('q', filterValues.q);
      if (from) params.append('from', String(from));
      if (to) params.append('to', String(to));

      const response = await fetch(`/api/chart-audit?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const result = await response.json() as { success: boolean; data: { logs: ChartAuditLog[]; total: number } };

      if (result.success) {
        setAuditLogs(result.data.logs);
        setAuditTotal(result.data.total);
      }
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'Failed to load audit logs');
      setAuditLogs([]);
      setAuditTotal(0);
    } finally {
      setIsAuditLoading(false);
    }
  }, [activeProjectId, auditPage, auditPageSize, filterValues]);

  // Reset page when filters or page size changes
  useEffect(() => {
    setAuditPage(1);
  }, [auditFilters, auditPageSize]);

  // Debounced refresh for search input to reduce API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshAuditLogs(activeProjectId);
    }, 300);

    return () => clearTimeout(timer);
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
    entityTypeOptions: ENTITY_TYPE_OPTIONS,
    actionTypeOptions: ACTION_TYPE_OPTIONS,
    actorTypeOptions: ACTOR_TYPE_OPTIONS,
  };
};
