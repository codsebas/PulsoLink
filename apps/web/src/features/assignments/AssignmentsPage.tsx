import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Link2, Unlink } from 'lucide-react';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { SelectField } from '../../components/admin/FormFields';
import { Badge } from '../../components/admin/Badge';
import { OptionPagination } from '../../components/admin/OptionPagination';
import { useSessionUser } from '../auth/useSessionUser';
import { useCatalogOptions } from '../catalog/useCatalogOptions';
import { useEntityLabels } from '../catalog/useEntityLabels';
import type { Assignment } from '../../lib/contract-types';
import { formatDateTime } from '../../lib/format';
import { useAssignments, type AssignmentFilters } from './api';
import { CreateAssignmentDialog } from './CreateAssignmentDialog';
import { ReassignDialog } from './ReassignDialog';
import { CloseAssignmentDialog } from './CloseAssignmentDialog';

const EMPTY_FILTERS: AssignmentFilters = {};
type OpenDialog = { kind: 'create' } | { kind: 'reassign' } | { kind: 'close'; assignment: Assignment } | null;

export const AssignmentsPage: React.FC = () => {
  const { data: user } = useSessionUser();
  const isAdmin = user?.role === 'admin';

  const [filters, setFilters] = useState<AssignmentFilters>(EMPTY_FILTERS);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = () => setDialog(null);
  const listQuery = useAssignments(filters);
  const catalog = useCatalogOptions();

  const rows = useMemo(() => listQuery.data?.pages.flatMap((page) => page.data) ?? [], [listQuery.data]);
  const { patientLabel, deviceLabel } = useEntityLabels(rows, catalog.patientNames, catalog.deviceCodes, catalog.ready, isAdmin);

  const columns: Column<Assignment>[] = [
    {
      key: 'patient',
      header: 'Paciente',
      primary: true,
      render: (a) => (
        <div>
          <div className="font-medium">{patientLabel(a.patientId) ?? '—'}</div>
          <div className="text-xs text-slate-400 font-mono">{a.patientId}</div>
        </div>
      ),
    },
    {
      key: 'device',
      header: 'Placa',
      render: (a) => (
        <div>
          <div className="font-medium font-mono">{deviceLabel(a.deviceId) ?? '—'}</div>
          <div className="text-xs text-slate-400 font-mono">{a.deviceId}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (a) => (a.endedAt === null ? <Badge tone="emerald">Activa</Badge> : <Badge tone="slate">Cerrada</Badge>),
    },
    { key: 'startedAt', header: 'Inicio', render: (a) => formatDateTime(a.startedAt) },
    { key: 'endedAt', header: 'Cierre', render: (a) => formatDateTime(a.endedAt) },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: 'Acciones',
            render: (a: Assignment) =>
              a.endedAt === null ? (
                <button
                  type="button"
                  onClick={() => setDialog({ kind: 'close', assignment: a })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg text-xs font-semibold text-rose-700 transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                  Cerrar
                </button>
              ) : null, // Cerrada: sin acciones; la tabla muestra "—" y la tarjeta omite el pie.
          } satisfies Column<Assignment>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Asignaciones</h1>
          <p className="text-sm text-slate-500">
            Relación placa ↔ paciente. Cerrar una asignación libera ambas reservas; el historial se
            conserva.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 self-start">
            <button
              type="button"
              onClick={() => setDialog({ kind: 'create' })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              <Link2 className="w-4 h-4" aria-hidden="true" />
              Asignar placa
            </button>
            <button
              type="button"
              onClick={() => setDialog({ kind: 'reassign' })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
              Reasignar
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <SelectField
          id="assignments-status"
          label="Estado"
          value={filters.status ?? ''}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, status: (event.target.value || undefined) as AssignmentFilters['status'] }))
          }
          options={[
            { value: '', label: 'Todos' },
            { value: 'active', label: 'Activas' },
            { value: 'closed', label: 'Cerradas' },
          ]}
        />
        <SelectField
          id="assignments-patient"
          label="Paciente"
          value={filters.patientId ?? ''}
          onChange={(event) => setFilters((prev) => ({ ...prev, patientId: event.target.value || undefined }))}
          options={[{ value: '', label: 'Todos' }, ...catalog.patientOptions]}
        />
        <SelectField
          id="assignments-device"
          label="Placa"
          value={filters.deviceId ?? ''}
          onChange={(event) => setFilters((prev) => ({ ...prev, deviceId: event.target.value || undefined }))}
          options={[{ value: '', label: 'Todas' }, ...catalog.deviceOptions]}
        />
      </div>

      <OptionPagination label="pacientes" query={catalog.patientsQuery} />
      <OptionPagination label="placas" query={catalog.devicesQuery} />
      <DataTable<Assignment>
        columns={columns}
        rows={rows}
        getKey={(a) => a.id}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        hasMore={listQuery.hasNextPage}
        isLoadingMore={listQuery.isFetchingNextPage}
        onLoadMore={() => void listQuery.fetchNextPage()}
        emptyMessage="No hay asignaciones."
        emptyHint="Asigna una placa habilitada a un paciente habilitado para poder crear sesiones."
      />

      {dialog?.kind === 'create' && <CreateAssignmentDialog catalog={catalog} onClose={closeDialog} />}
      {dialog?.kind === 'reassign' && <ReassignDialog catalog={catalog} onClose={closeDialog} />}
      {dialog?.kind === 'close' && <CloseAssignmentDialog assignment={dialog.assignment} onClose={closeDialog} />}
    </div>
  );
};
