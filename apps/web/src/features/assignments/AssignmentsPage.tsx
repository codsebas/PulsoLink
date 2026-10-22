import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Link2, Unlink } from 'lucide-react';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { FormDialog } from '../../components/admin/FormDialog';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { SelectField } from '../../components/admin/FormFields';
import { Badge } from '../../components/admin/Badge';
import { useSessionUser } from '../auth/useSessionUser';
import { useAssignments, useCreateAssignment, useCloseAssignment, type AssignmentFilters } from './api';
import { usePatientOptions } from '../patients/api';
import { useDeviceOptions } from '../devices/api';
import type { Assignment } from '../../lib/contract-types';
import { formatDateTime } from '../../lib/format';
import { OptionPagination } from '../../components/admin/OptionPagination';
import { formatApiError } from '../../components/admin/api-error';

function useLookupOptions() {
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

  return { patientNames, deviceCodes, patientsQuery, devicesQuery };
}

const EMPTY_FILTERS: AssignmentFilters = {};

export const AssignmentsPage: React.FC = () => {
  const { data: user } = useSessionUser();
  const isAdmin = user?.role === 'admin';

  const [filters, setFilters] = useState<AssignmentFilters>(EMPTY_FILTERS);
  const listQuery = useAssignments(filters);
  const { patientNames, deviceCodes, patientsQuery, devicesQuery } = useLookupOptions();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ patientId: '', deviceId: '' });
  const createMutation = useCreateAssignment();

  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignPatientId, setReassignPatientId] = useState('');
  const [reassignDeviceId, setReassignDeviceId] = useState('');
  const [reassignStep, setReassignStep] = useState<'idle' | 'closing' | 'creating'>('idle');
  const [reassignPartialFailure, setReassignPartialFailure] = useState(false);

  // Consultas propias del diálogo de reasignación: no dependen de los filtros
  // ni de la paginación de la tabla (revisión del PR #38).
  const reassignQueryEnabled = reassignOpen && Boolean(reassignPatientId);
  const activeForPatientQuery = useAssignments(
    { patientId: reassignPatientId, status: 'active' },
    { enabled: reassignQueryEnabled },
  );
  const activeForDeviceQuery = useAssignments(
    { deviceId: reassignDeviceId, status: 'active' },
    { enabled: reassignOpen && Boolean(reassignDeviceId) },
  );

  const [closeTarget, setCloseTarget] = useState<Assignment | null>(null);
  const closeMutation = useCloseAssignment();

  const rows = listQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const patientOptions = useMemo(
    () =>
      Array.from(patientNames.entries()).map(([value, label]) => ({ value, label })),
    [patientNames],
  );
  const deviceOptions = useMemo(
    () =>
      Array.from(deviceCodes.entries()).map(([value, label]) => ({ value, label })),
    [deviceCodes],
  );

  // Origen de verdad propio del diálogo: primera página del filtro activo del
  // paciente, sin depender de los filtros ni del cursor de la tabla.
  const activeForReassignedPatient = activeForPatientQuery.data?.pages[0]?.data[0];
  const reassignLookupLoading =
    activeForPatientQuery.isLoading ||
    (Boolean(reassignDeviceId) && activeForDeviceQuery.isLoading);

  // Asignación activa que ya usa la placa elegida; si es de otro paciente, no
  // se puede crear la nueva asignación.
  const deviceActiveAssignment = activeForDeviceQuery.data?.pages[0]?.data[0];
  const deviceOccupiedByOther =
    Boolean(deviceActiveAssignment) && deviceActiveAssignment?.patientId !== reassignPatientId;
  const reassignLookupError = activeForPatientQuery.error ?? activeForDeviceQuery.error;
  const reassignBlocked = reassignLookupLoading || Boolean(reassignLookupError) || deviceOccupiedByOther ||
    activeForReassignedPatient?.deviceId === reassignDeviceId;

  const openReassignDialog = () => {
    createMutation.reset();
    closeMutation.reset();
    setReassignPartialFailure(false);
    setReassignPatientId('');
    setReassignDeviceId('');
    setReassignOpen(true);
  };

  const closeReassignDialog = () => {
    setReassignOpen(false);
    setReassignPartialFailure(false);
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await createMutation.mutateAsync({
        patientId: createForm.patientId,
        deviceId: createForm.deviceId,
      });
      setCreateOpen(false);
      setCreateForm({ patientId: '', deviceId: '' });
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  const handleReassign = async () => {
    if (!reassignPatientId || !reassignDeviceId || reassignBlocked) return;
    createMutation.reset();
    closeMutation.reset();
    setReassignPartialFailure(false);
    let closedPrevious = false;
    try {
      if (activeForReassignedPatient) {
        setReassignStep('closing');
        await closeMutation.mutateAsync(activeForReassignedPatient.id);
        closedPrevious = true;
      }
      setReassignStep('creating');
      await createMutation.mutateAsync({
        patientId: reassignPatientId,
        deviceId: reassignDeviceId,
      });
      closeReassignDialog();
    } catch {
      // El cierre no es atómico con la creación: si ya se cerró, avisar que la
      // paciente queda sin asignación activa (revisión del PR #38).
      setReassignPartialFailure(closedPrevious);
    } finally {
      setReassignStep('idle');
    }
  };

  const handleClose = async () => {
    if (!closeTarget) return;
    try {
      await closeMutation.mutateAsync(closeTarget.id);
      setCloseTarget(null);
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  const columns: Column<Assignment>[] = [
    {
      key: 'patient',
      header: 'Paciente',
      render: (a) => (
        <div>
          <div className="font-medium">{patientNames.get(a.patientId) ?? '—'}</div>
          <div className="text-xs text-slate-400 font-mono">{a.patientId}</div>
        </div>
      ),
    },
    {
      key: 'device',
      header: 'Placa',
      render: (a) => (
        <div>
          <div className="font-medium font-mono">{deviceCodes.get(a.deviceId) ?? '—'}</div>
          <div className="text-xs text-slate-400 font-mono">{a.deviceId}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (a) =>
        a.endedAt === null ? (
          <Badge tone="emerald">Activa</Badge>
        ) : (
          <Badge tone="slate">Cerrada</Badge>
        ),
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
                  onClick={() => setCloseTarget(a)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg text-xs font-semibold text-rose-700 transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                  Cerrar
                </button>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              ),
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
              onClick={() => {
                createMutation.reset();
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              <Link2 className="w-4 h-4" aria-hidden="true" />
              Asignar placa
            </button>
            <button
              type="button"
              onClick={openReassignDialog}
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
            setFilters((prev) => ({
              ...prev,
              status: (event.target.value || undefined) as AssignmentFilters['status'],
            }))
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
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, patientId: event.target.value || undefined }))
          }
          options={[{ value: '', label: 'Todos' }, ...patientOptions]}
        />
        <SelectField
          id="assignments-device"
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

      <FormDialog
        open={createOpen}
        title="Asignar placa a paciente"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        submitLabel="Asignar"
        isSubmitting={createMutation.isPending}
        error={createMutation.error}
      >
        <OptionPagination label="pacientes" query={patientsQuery} />
        <OptionPagination label="placas" query={devicesQuery} />
        <SelectField
          id="assignment-patient"
          label="Paciente"
          required
          value={createForm.patientId}
          onChange={(event) => setCreateForm((prev) => ({ ...prev, patientId: event.target.value }))}
          options={[{ value: '', label: 'Selecciona un paciente…' }, ...patientOptions]}
        />
        <SelectField
          id="assignment-device"
          label="Placa"
          required
          value={createForm.deviceId}
          onChange={(event) => setCreateForm((prev) => ({ ...prev, deviceId: event.target.value }))}
          options={[{ value: '', label: 'Selecciona una placa…' }, ...deviceOptions]}
          hint="Solo placas habilitadas. Si el paciente o la placa ya están ocupados, la API responde con un conflicto."
        />
      </FormDialog>

      <FormDialog
        open={reassignOpen}
        title="Reasignar placa"
        onClose={closeReassignDialog}
        onSubmit={(event) => {
          event.preventDefault();
          void handleReassign();
        }}
        submitLabel="Reasignar"
        isSubmitting={
          reassignStep !== 'idle' || createMutation.isPending || closeMutation.isPending
        }
        error={createMutation.error ?? closeMutation.error}
        footer={
          <button
            type="submit"
            disabled={
              reassignBlocked ||
              reassignStep !== 'idle' ||
              createMutation.isPending ||
              closeMutation.isPending
            }
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {reassignLookupLoading
              ? 'Consultando asignaciones…'
              : reassignStep === 'closing'
                ? 'Cerrando asignación…'
                : reassignStep === 'creating'
                  ? 'Creando asignación…'
                  : 'Reasignar'}
          </button>
        }
      >
        <OptionPagination label="pacientes" query={patientsQuery} />
        <OptionPagination label="placas" query={devicesQuery} />
        {reassignLookupError ? <div role="alert" className="text-sm text-rose-800">
          {formatApiError(reassignLookupError)}
          <button type="button" onClick={() => { void activeForPatientQuery.refetch(); if (reassignDeviceId) void activeForDeviceQuery.refetch(); }}>Reintentar asignaciones</button>
        </div> : null}
        {reassignPartialFailure && (
          <div
            role="alert"
            className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900"
          >
            La asignación anterior ya se cerró; la nueva no se pudo crear. La paciente queda sin
            asignación activa. Reintenta con una placa disponible.
          </div>
        )}
        <SelectField
          id="reassign-patient"
          label="Paciente"
          required
          value={reassignPatientId}
          onChange={(event) => setReassignPatientId(event.target.value)}
          options={[{ value: '', label: 'Selecciona un paciente…' }, ...patientOptions]}
        />
        {reassignPatientId && (
          <p className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-800">
            {activeForPatientQuery.isLoading ? (
              'Consultando la asignación activa de la paciente…'
            ) : activeForReassignedPatient ? (
              <>
                Se cerrará la asignación activa actual (placa{' '}
                <strong className="font-mono">
                  {deviceCodes.get(activeForReassignedPatient.deviceId) ??
                    activeForReassignedPatient.deviceId}
                </strong>
                ) y se creará una nueva. El historial previo del paciente se conserva.
              </>
            ) : (
              'Este paciente no tiene asignación activa; se creará una nueva directamente.'
            )}
          </p>
        )}
        <SelectField
          id="reassign-device"
          label="Nueva placa"
          required
          value={reassignDeviceId}
          onChange={(event) => setReassignDeviceId(event.target.value)}
          options={[{ value: '', label: 'Selecciona una placa…' }, ...deviceOptions]}
        />
        {reassignDeviceId && activeForDeviceQuery.isLoading && (
          <p className="text-xs text-slate-500">Consultando la asignación activa de la placa…</p>
        )}
        {deviceOccupiedByOther && deviceActiveAssignment && (
          <div
            role="alert"
            className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-800"
          >
            Esta placa ya tiene una asignación activa con{' '}
            <strong>{patientNames.get(deviceActiveAssignment.patientId) ?? 'otro paciente'}</strong>
            . Elige otra placa.
          </div>
        )}
        {reassignDeviceId && activeForReassignedPatient?.deviceId === reassignDeviceId ?
          <p role="status" className="text-sm text-amber-900">Esta placa ya está asignada al paciente. Selecciona una placa diferente.</p> : null}
      </FormDialog>

      <ConfirmDialog
        open={closeTarget !== null}
        title="Cerrar asignación"
        danger
        isPending={closeMutation.isPending}
        error={closeMutation.error}
        message={
          <>
            Se cerrará la asignación{' '}
            <strong className="font-mono">{closeTarget?.id}</strong> y se liberarán el paciente y la
            placa. Debe no tener sesiones abiertas; el historial no se modifica.
          </>
        }
        confirmLabel="Cerrar asignación"
        onConfirm={() => void handleClose()}
        onCancel={() => setCloseTarget(null)}
      />
    </div>
  );
};
