import { useCursorList } from '../../../components/admin/useCursorList';
import type { AuditLog } from '../../../lib/contract-types';

export interface AuditFilters {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
}

export function useAuditLogs(filters: AuditFilters = {}) {
  return useCursorList<AuditLog>({
    queryKey: ['audit-logs', filters],
    endpoint: '/audit-logs',
    params: {
      actorId: filters.actorId,
      action: filters.action,
      targetType: filters.targetType,
      targetId: filters.targetId,
    },
  });
}
