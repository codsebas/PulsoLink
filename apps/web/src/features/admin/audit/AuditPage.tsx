import React, { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { DataTable, type Column } from '../../../components/admin/DataTable';
import { TextField } from '../../../components/admin/FormFields';
import { Badge, resultTone } from '../../../components/admin/Badge';
import { AdminRoute } from '../../../components/admin/AdminRoute';
import { useAuditLogs, type AuditFilters } from './api';
import type { AuditLog } from '../../../lib/contract-types';
import { formatDateTime } from '../../../lib/format';

const EMPTY_FILTERS: AuditFilters = {};

const AuditContent: React.FC = () => {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const listQuery = useAuditLogs(filters);

  const rows = listQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const columns: Column<AuditLog>[] = [
    { key: 'occurredAt', header: 'Fecha', render: (log) => formatDateTime(log.occurredAt) },
    { key: 'actorId', header: 'Actor', render: (log) => <span className="font-mono text-xs">{log.actorId}</span> },
    { key: 'action', header: 'Acción', render: (log) => <span className="font-mono text-xs font-semibold">{log.action}</span> },
    {
      key: 'target',
      header: 'Objetivo',
      render: (log) => (
        <span className="font-mono text-xs">
          {log.targetType}:{log.targetId}
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Resultado',
      render: (log) => (
        <Badge tone={resultTone[log.result] ?? 'slate'}>
          {log.result === 'success' ? 'Éxito' : 'Fallo'}
        </Badge>
      ),
    },
    {
      key: 'context',
      header: 'Contexto',
      className: 'max-w-xs',
      render: (log) => (
        <details>
          <summary className="cursor-pointer text-xs text-sky-700 font-semibold">Ver</summary>
          <pre className="mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] overflow-x-auto">
            {JSON.stringify(log.context, null, 2)}
          </pre>
        </details>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditoría</h1>
        <p className="text-sm text-slate-500">
          Registro inmutable de accesos y cambios administrativos. Solo visible para administradores.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <TextField
          id="audit-action"
          label="Acción"
          value={filters.action ?? ''}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, action: event.target.value || undefined }))
          }
          placeholder="auth.login, patient.create…"
          autoComplete="off"
        />
        <TextField
          id="audit-actor"
          label="Actor (UID)"
          value={filters.actorId ?? ''}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, actorId: event.target.value || undefined }))
          }
          autoComplete="off"
        />
        <TextField
          id="audit-target-type"
          label="Tipo de objetivo"
          value={filters.targetType ?? ''}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, targetType: event.target.value || undefined }))
          }
          placeholder="patient, assignment…"
          autoComplete="off"
        />
      </div>

      <DataTable<AuditLog>
        columns={columns}
        rows={rows}
        getKey={(log) => log.id}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        hasMore={listQuery.hasNextPage}
        isLoadingMore={listQuery.isFetchingNextPage}
        onLoadMore={() => void listQuery.fetchNextPage()}
        emptyMessage="No hay eventos de auditoría."
        emptyHint="Los inicios de sesión y los cambios administrativos aparecerán aquí."
      />

      <p className="text-xs text-slate-400 flex items-center gap-1">
        <ScrollText className="w-3.5 h-3.5" aria-hidden="true" />
        La auditoría no contiene secretos ni lecturas; los refrescos periódicos no generan eventos.
      </p>
    </div>
  );
};

export const AuditPage: React.FC = () => (
  <AdminRoute>
    <AuditContent />
  </AdminRoute>
);
