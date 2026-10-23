import React, { useState } from 'react';
import { CircuitBoard, PlusCircle } from 'lucide-react';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { Badge, enabledTone, sourceTone } from '../../components/admin/Badge';
import { EditToggleActions } from '../../components/admin/EditToggleActions';
import { ToggleEnabledDialog } from '../../components/admin/ToggleEnabledDialog';
import { useSessionUser } from '../auth/useSessionUser';
import { useDevices, useUpdateDevice, type DeviceFilters } from './api';
import type { Device } from '../../lib/contract-types';
import { formatDateTime } from '../../lib/format';
import { DeviceFormDialog } from './DeviceFormDialog';

const EMPTY_FILTERS: DeviceFilters = {};
type OpenDialog = { kind: 'form'; device: Device | null } | { kind: 'toggle'; device: Device } | null;

export const DevicesPage: React.FC = () => {
  const { data: user } = useSessionUser();
  const isAdmin = user?.role === 'admin';

  const [filters, setFilters] = useState<DeviceFilters>(EMPTY_FILTERS);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = () => setDialog(null);
  const listQuery = useDevices(filters);
  const updateMutation = useUpdateDevice();

  const rows = listQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const columns: Column<Device>[] = [
    { key: 'code', header: 'Código', render: (d) => <span className="font-mono font-semibold">{d.code}</span> },
    {
      key: 'source',
      header: 'Origen',
      render: (d) => <Badge tone={sourceTone[d.source]}>{d.source === 'real' ? 'Real' : 'Simulada'}</Badge>,
    },
    {
      key: 'enabled',
      header: 'Estado',
      render: (d) => <Badge tone={enabledTone(d.enabled)}>{d.enabled ? 'Habilitada' : 'Deshabilitada'}</Badge>,
    },
    {
      key: 'activeSessionId',
      header: 'Sesión activa',
      render: (d) =>
        d.activeSessionId ? (
          <span className="font-mono text-xs">{d.activeSessionId}</span>
        ) : (
          <span className="text-slate-400">Sin sesión</span>
        ),
    },
    { key: 'lastSeenAt', header: 'Última comunicación', render: (d) => formatDateTime(d.lastSeenAt) },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: 'Acciones',
            render: (d: Device) => (
              <EditToggleActions
                enabled={d.enabled}
                onEdit={() => setDialog({ kind: 'form', device: d })}
                onToggle={() => setDialog({ kind: 'toggle', device: d })}
              />
            ),
          } satisfies Column<Device>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Placas</h1>
          <p className="text-sm text-slate-500">
            Dispositivos IoT registrados. Deshabilitar conserva el historial de mediciones.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <label htmlFor="devices-enabled-filter" className="text-xs font-semibold text-slate-500">
            Estado
          </label>
          <select
            id="devices-enabled-filter"
            value={filters.enabled === undefined ? '' : String(filters.enabled)}
            onChange={(event) =>
              setFilters(event.target.value === '' ? EMPTY_FILTERS : { enabled: event.target.value === 'true' })
            }
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">Todas</option>
            <option value="true">Habilitadas</option>
            <option value="false">Deshabilitadas</option>
          </select>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setDialog({ kind: 'form', device: null })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" aria-hidden="true" />
              Nueva placa
            </button>
          )}
        </div>
      </div>

      <DataTable<Device>
        columns={columns}
        rows={rows}
        getKey={(d) => d.id}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        hasMore={listQuery.hasNextPage}
        isLoadingMore={listQuery.isFetchingNextPage}
        onLoadMore={() => void listQuery.fetchNextPage()}
        emptyMessage="No hay placas registradas."
        emptyHint="Registra una placa simulada o real para poder asignarla a un paciente."
      />

      {dialog?.kind === 'form' && <DeviceFormDialog device={dialog.device} onClose={closeDialog} />}
      {dialog?.kind === 'toggle' && (
        <ToggleEnabledDialog
          target={dialog.device}
          noun="placa"
          disableMessage={
            <>
              Se deshabilitará la placa <strong>{dialog.device.code}</strong>. Si tiene una asignación
              activa la API responderá con un conflicto; el historial se conserva.
            </>
          }
          enableMessage={
            <>
              Se habilitará la placa <strong>{dialog.device.code}</strong> para nuevas asignaciones.
            </>
          }
          onConfirm={(d) => updateMutation.mutateAsync({ id: d.id, input: { enabled: !d.enabled } })}
          onClose={closeDialog}
        />
      )}

      {!isAdmin && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <CircuitBoard className="w-3.5 h-3.5" aria-hidden="true" />
          Consulta en modo solo lectura. La creación y edición requieren rol administrador.
        </p>
      )}
    </div>
  );
};
