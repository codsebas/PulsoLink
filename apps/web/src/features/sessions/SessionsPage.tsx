import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Play, Square, ExternalLink } from 'lucide-react';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { FormDialog } from '../../components/admin/FormDialog';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { SelectField } from '../../components/admin/FormFields';
import { Badge, sessionStatusTone, sourceTone } from '../../components/admin/Badge';
import { formatApiError } from '../../components/admin/api-error';
import { useSessionUser } from '../auth/useSessionUser';
import {
  useSessions,
  useCreateSession,
  useStartSession,
  useFinishSession,
  type SessionFilters,
} from './api';
import { useAssignments } from '../assignments/api';
import { useEntityLabels } from '../assignments/useEntityLabels';
import { usePatientOptions } from '../patients/api';
import { useDeviceOptions } from '../devices/api';
import type { Session } from '../../lib/contract-types';
import { formatDateTime } from '../../lib/format';
import { OptionPagination } from '../../components/admin/OptionPagination';

const STATUS_LABELS: Record<Session['status'], string> = {
  created: 'Creada',
  active: 'Activa',
  finished: 'Finalizada',
};

const EMPTY_FILTERS: SessionFilters = {};

export const SessionsPage: React.FC = () => {
  const { data: user } = useSessionUser();
  const isAdmin = user?.role === 'admin';

  const [filters, setFilters] = useState<SessionFilters>(EMPTY_FILTERS);
  const listQuery = useSessions(filters);

  const activeAssignmentsQuery = useAssignments({ status: 'active' });
  const patientsQuery = usePatientOptions();
  const devicesQuery = useDeviceOptions();

  const patientNames = useMemo(() => {
    const map = new Map<string, string>();
    patientsQuery.data?.pages.forEach((page) =>
      page.data.forEach((patient) => map.set(patient.id, `${patient.displayName} (${patient.code})`)),
    );
    return map;
  }, [patientsQuery.data]);

  const deviceCodes = useMemo(() => {
    const map = new Map<string, string>();
    devicesQuery.data?.pages.forEach((page) =>
      page.data.forEach((device) => map.set(device.id, device.code)),
    );
    return map;
  }, [devicesQuery.data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const createMutation = useCreateSession();

  const startMutation = useStartSession();
  const finishMutation = useFinishSession();
  const [finishTarget, setFinishTarget] = useState<Session | null>(null);

  const rows = useMemo(() => listQuery.data?.pages.flatMap((page) => page.data) ?? [], [listQuery.data]);
  const { patientLabel, deviceLabel } = useEntityLabels(
    rows,
    patientNames,
    deviceCodes,
    !patientsQuery.isLoading && !devicesQuery.isLoading,
    isAdmin,
  );

  const patientOptions = useMemo(
    () => Array.from(patientNames.entries()).map(([value, label]) => ({ value, label })),
    [patientNames],
  );
  const deviceOptions = useMemo(
    () => Array.from(deviceCodes.entries()).map(([value, label]) => ({ value, label })),
    [deviceCodes],
  );

  const activeAssignmentOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    activeAssignmentsQuery.data?.pages.forEach((page) =>
      page.data.forEach((assignment) => {
        const patient = patientNames.get(assignment.patientId) ?? assignment.patientId;
        const device = deviceCodes.get(assignment.deviceId) ?? assignment.deviceId;
        options.push({ value: assignment.id, label: `${patient} ↔ ${device}` });
      }),
    );
    return options;
  }, [activeAssignmentsQuery.data, patientNames, deviceCodes]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await createMutation.mutateAsync(selectedAssignmentId);
      setCreateOpen(false);
      setSelectedAssignmentId('');
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  const handleStart = async (id: string) => {
    startMutation.reset();
    try {
      await startMutation.mutateAsync(id);
    } catch {
      // El error queda expuesto en startMutation.error y se muestra bajo el listado.
    }
  };

  const handleFinish = async () => {
    if (!finishTarget) return;
    try {
      await finishMutation.mutateAsync(finishTarget.id);
      setFinishTarget(null);
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  const columns: Column<Session>[] = [
    {
      key: 'id',
      header: 'Sesión',
      primary: true,
      render: (s) => (
        <Link
          to={`/sessions/${s.id}`}
          className="font-mono text-xs font-semibold text-sky-700 hover:underline inline-flex items-center gap-1"
        >
          {s.id}
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </Link>
      ),
    },
    {
      key: 'patient',
      header: 'Paciente',
      render: (s) => patientLabel(s.patientId) ?? <span className="font-mono text-xs">{s.patientId}</span>,
    },
    {
      key: 'device',
      header: 'Placa',
      render: (s) => (
        <span className="font-mono font-medium">{deviceLabel(s.deviceId) ?? s.deviceId}</span>
      ),
    },
    {
      key: 'source',
      header: 'Origen',
      render: (s) => (
        <Badge tone={sourceTone[s.source]}>{s.source === 'real' ? 'Real' : 'Simulada'}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (s) => <Badge tone={sessionStatusTone[s.status]}>{STATUS_LABELS[s.status]}</Badge>,
    },
    { key: 'createdAt', header: 'Creada', render: (s) => formatDateTime(s.createdAt) },
    { key: 'startedAt', header: 'Inicio', render: (s) => formatDateTime(s.startedAt) },
    { key: 'finishedAt', header: 'Fin', render: (s) => formatDateTime(s.finishedAt) },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: 'Acciones',
            // Sin acciones (p. ej. sesión finalizada) devuelve null: la tarjeta móvil omite el pie.
            render: (s: Session) => (s.status !== 'created' && s.status !== 'active' ? null : (
              <div className="flex gap-2">
                {s.status === 'created' && (
                  <button
                    type="button"
                    onClick={() => void handleStart(s.id)}
                    disabled={startMutation.isPending && startMutation.variables === s.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-semibold text-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    Iniciar
                  </button>
                )}
                {s.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => setFinishTarget(s)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg text-xs font-semibold text-rose-700 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" aria-hidden="true" />
                    Finalizar
                  </button>
                )}
              </div>
            )),
          } satisfies Column<Session>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sesiones de Medición</h1>
          <p className="text-sm text-slate-500">
            Cada sesión nace de una asignación activa entre un paciente y una placa.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              createMutation.reset();
              void activeAssignmentsQuery.refetch();
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm self-start"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" />
            Nueva Sesión
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <SelectField
          id="sessions-status"
          label="Estado"
          value={filters.status ?? ''}
          onChange={(event) =>
            setFilters((prev) => ({
              ...prev,
              status: (event.target.value || undefined) as SessionFilters['status'],
            }))
          }
          options={[
            { value: '', label: 'Todos' },
            { value: 'created', label: 'Creadas' },
            { value: 'active', label: 'Activas' },
            { value: 'finished', label: 'Finalizadas' },
          ]}
        />
        <SelectField
          id="sessions-patient"
          label="Paciente"
          value={filters.patientId ?? ''}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, patientId: event.target.value || undefined }))
          }
          options={[{ value: '', label: 'Todos' }, ...patientOptions]}
        />
        <SelectField
          id="sessions-device"
          label="Placa"
          value={filters.deviceId ?? ''}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, deviceId: event.target.value || undefined }))
          }
          options={[{ value: '', label: 'Todas' }, ...deviceOptions]}
        />
      </div>

      <OptionPagination label="pacientes" query={patientsQuery} />
      <OptionPagination label="placas" query={devicesQuery} />
      <DataTable<Session>
        columns={columns}
        rows={rows}
        getKey={(s) => s.id}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        hasMore={listQuery.hasNextPage}
        isLoadingMore={listQuery.isFetchingNextPage}
        onLoadMore={() => void listQuery.fetchNextPage()}
        emptyMessage="No hay sesiones registradas."
        emptyHint="Crea una sesión desde una asignación activa para que la placa pueda enviar mediciones."
      />

      {startMutation.error && (
        <div
          role="alert"
          className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start justify-between gap-3"
        >
          <span>No se pudo iniciar la sesión: {formatApiError(startMutation.error)}</span>
          <button
            type="button"
            onClick={() => startMutation.reset()}
            className="font-semibold text-rose-700 hover:underline flex-shrink-0"
          >
            Descartar
          </button>
        </div>
      )}

      <FormDialog
        open={createOpen}
        title="Nueva sesión de medición"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        submitLabel="Crear sesión"
        isSubmitting={createMutation.isPending}
        error={createMutation.error}
      >
        <OptionPagination label="asignaciones" query={activeAssignmentsQuery} />
        <SelectField
          id="session-assignment"
          label="Asignación activa"
          required
          value={selectedAssignmentId}
          onChange={(event) => setSelectedAssignmentId(event.target.value)}
          options={[
            { value: '', label: 'Selecciona una asignación…' },
            ...activeAssignmentOptions,
          ]}
          hint="El servidor resuelve paciente, placa y origen desde la asignación; no se elige dispositivo manualmente."
        />
      </FormDialog>

      <ConfirmDialog
        open={finishTarget !== null}
        title="Finalizar sesión"
        danger
        isPending={finishMutation.isPending}
        error={finishMutation.error}
        message={
          <>
            Se finalizará la sesión <strong className="font-mono">{finishTarget?.id}</strong> y la
            placa dejará de poder enviar mediciones nuevas. No se reabre.
          </>
        }
        confirmLabel="Finalizar"
        onConfirm={() => void handleFinish()}
        onCancel={() => setFinishTarget(null)}
      />
    </div>
  );
};
