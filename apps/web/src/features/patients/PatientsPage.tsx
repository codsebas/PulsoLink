import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, PlusCircle } from 'lucide-react';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { Badge, enabledTone } from '../../components/admin/Badge';
import { EditToggleActions } from '../../components/admin/EditToggleActions';
import { ToggleEnabledDialog } from '../../components/admin/ToggleEnabledDialog';
import { useSessionUser } from '../auth/useSessionUser';
import { usePatients, useUpdatePatient, type PatientFilters } from './api';
import type { Patient } from '../../lib/contract-types';
import { formatDateTime } from '../../lib/format';
import { PatientFormDialog } from './PatientFormDialog';

const EMPTY_FILTERS: PatientFilters = {};
type OpenDialog = { kind: 'form'; patient: Patient | null } | { kind: 'toggle'; patient: Patient } | null;

export const PatientsPage: React.FC = () => {
  const { data: user } = useSessionUser();
  const isAdmin = user?.role === 'admin';

  const [filters, setFilters] = useState<PatientFilters>(EMPTY_FILTERS);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = () => setDialog(null);
  const listQuery = usePatients(filters);
  const updateMutation = useUpdatePatient();

  const rows = listQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const columns: Column<Patient>[] = [
    { key: 'monitoring', header: 'Monitoreo', render: (patient) => <Link
      to={`/monitoring/${encodeURIComponent(patient.id)}`}
      className="font-semibold text-sky-800 hover:underline focus-visible:outline focus-visible:outline-2"
      aria-label={`Ver monitoreo de ${patient.displayName}`}>Ver monitoreo</Link>, mobile: 'actions' },
    { key: 'code', header: 'Código', render: (p) => <span className="font-mono font-semibold">{p.code}</span> },
    { key: 'displayName', header: 'Nombre visible', render: (p) => p.displayName, primary: true },
    {
      key: 'enabled',
      header: 'Estado',
      render: (p) => <Badge tone={enabledTone(p.enabled)}>{p.enabled ? 'Habilitado' : 'Deshabilitado'}</Badge>,
    },
    { key: 'createdAt', header: 'Creado', render: (p) => formatDateTime(p.createdAt) },
    { key: 'updatedAt', header: 'Actualizado', render: (p) => formatDateTime(p.updatedAt) },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: 'Acciones',
            render: (p: Patient) => (
              <EditToggleActions
                enabled={p.enabled}
                onEdit={() => setDialog({ kind: 'form', patient: p })}
                onToggle={() => setDialog({ kind: 'toggle', patient: p })}
              />
            ),
          } satisfies Column<Patient>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pacientes</h1>
          <p className="text-sm text-slate-500">
            Administración de expedientes seudónimos. El historial nunca se borra al deshabilitar.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <label htmlFor="patients-enabled-filter" className="text-xs font-semibold text-slate-500">
            Estado
          </label>
          <select
            id="patients-enabled-filter"
            value={filters.enabled === undefined ? '' : String(filters.enabled)}
            onChange={(event) =>
              setFilters(event.target.value === '' ? EMPTY_FILTERS : { enabled: event.target.value === 'true' })
            }
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">Todos</option>
            <option value="true">Habilitados</option>
            <option value="false">Deshabilitados</option>
          </select>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setDialog({ kind: 'form', patient: null })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" aria-hidden="true" />
              Nuevo paciente
            </button>
          )}
        </div>
      </div>

      <DataTable<Patient>
        columns={columns}
        rows={rows}
        getKey={(p) => p.id}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        hasMore={listQuery.hasNextPage}
        isLoadingMore={listQuery.isFetchingNextPage}
        onLoadMore={() => void listQuery.fetchNextPage()}
        emptyMessage="No hay pacientes registrados."
        emptyHint="Crea un paciente para poder asignarle una placa."
      />

      {dialog?.kind === 'form' && <PatientFormDialog patient={dialog.patient} onClose={closeDialog} />}
      {dialog?.kind === 'toggle' && (
        <ToggleEnabledDialog
          target={dialog.patient}
          noun="paciente"
          disableMessage={
            <>
              Se deshabilitará <strong>{dialog.patient.displayName}</strong>. Los registros históricos se
              conservan; si tiene una asignación activa la API responderá con un conflicto.
            </>
          }
          enableMessage={
            <>
              Se habilitará <strong>{dialog.patient.displayName}</strong> para nuevas asignaciones.
            </>
          }
          onConfirm={(p) => updateMutation.mutateAsync({ id: p.id, input: { enabled: !p.enabled } })}
          onClose={closeDialog}
        />
      )}

      {!isAdmin && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          Consulta en modo solo lectura. La creación y edición requieren rol administrador.
        </p>
      )}
    </div>
  );
};
