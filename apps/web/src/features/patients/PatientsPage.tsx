import React, { useState } from 'react';
import { z } from 'zod';
import { Users, PlusCircle, Pencil, Power } from 'lucide-react';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { FormDialog } from '../../components/admin/FormDialog';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { TextField, CheckboxField, zodFieldErrors } from '../../components/admin/FormFields';
import { Badge, enabledTone } from '../../components/admin/Badge';
import { useSessionUser } from '../auth/useSessionUser';
import { usePatients, useCreatePatient, useUpdatePatient, type PatientFilters } from './api';
import type { Patient } from '../../lib/contract-types';
import { formatDateTime } from '../../lib/format';

const patientSchema = z.object({
  code: z.string().trim().min(1, 'Requerido').max(32, 'Máximo 32 caracteres'),
  displayName: z.string().trim().min(1, 'Requerido').max(120, 'Máximo 120 caracteres'),
});

const EMPTY_FILTERS: PatientFilters = {};

export const PatientsPage: React.FC = () => {
  const { data: user } = useSessionUser();
  const isAdmin = user?.role === 'admin';

  const [filters, setFilters] = useState<PatientFilters>(EMPTY_FILTERS);
  const listQuery = usePatients(filters);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState({ code: '', displayName: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [disableTarget, setDisableTarget] = useState<Patient | null>(null);

  const createMutation = useCreatePatient();
  const updateMutation = useUpdatePatient();

  const rows = listQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', displayName: '' });
    setFieldErrors({});
    createMutation.reset();
    setDialogOpen(true);
  };

  const openEdit = (patient: Patient) => {
    setEditing(patient);
    setForm({ code: patient.code, displayName: patient.displayName });
    setFieldErrors({});
    updateMutation.reset();
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = patientSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setFieldErrors({});

    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, input: parsed.data });
      } else {
        await createMutation.mutateAsync(parsed.data);
      }
      setDialogOpen(false);
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  const handleToggleEnabled = async () => {
    if (!disableTarget) return;
    try {
      await updateMutation.mutateAsync({
        id: disableTarget.id,
        input: { enabled: !disableTarget.enabled },
      });
      setDisableTarget(null);
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  const columns: Column<Patient>[] = [
    { key: 'code', header: 'Código', render: (p) => <span className="font-mono font-semibold">{p.code}</span> },
    { key: 'displayName', header: 'Nombre visible', render: (p) => p.displayName },
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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setDisableTarget(p)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    p.enabled
                      ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" aria-hidden="true" />
                  {p.enabled ? 'Deshabilitar' : 'Habilitar'}
                </button>
              </div>
            ),
          } satisfies Column<Patient>,
        ]
      : []),
  ];

  const mutationError = editing ? updateMutation.error : createMutation.error;
  const isMutating = editing ? updateMutation.isPending : createMutation.isPending;

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
              onClick={openCreate}
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

      <FormDialog
        open={dialogOpen}
        title={editing ? 'Editar paciente' : 'Nuevo paciente'}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        submitLabel={editing ? 'Guardar cambios' : 'Crear paciente'}
        isSubmitting={isMutating}
        error={mutationError}
      >
        <TextField
          id="patient-code"
          label="Código"
          required
          value={form.code}
          onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
          error={fieldErrors.code}
          hint="1 a 32 caracteres; identificador corto del expediente."
          maxLength={32}
          autoComplete="off"
        />
        <TextField
          id="patient-display-name"
          label="Nombre visible"
          required
          value={form.displayName}
          onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
          error={fieldErrors.displayName}
          hint="Alias seudónimo; no usar datos clínicos ni personales reales."
          maxLength={120}
          autoComplete="off"
        />
      </FormDialog>

      <ConfirmDialog
        open={disableTarget !== null}
        title={disableTarget?.enabled ? 'Deshabilitar paciente' : 'Habilitar paciente'}
        danger={disableTarget?.enabled ?? false}
        isPending={updateMutation.isPending}
        error={updateMutation.error}
        message={
          disableTarget?.enabled ? (
            <>
              Se deshabilitará <strong>{disableTarget.displayName}</strong>. Los registros históricos se
              conservan; si tiene una asignación activa la API responderá con un conflicto.
            </>
          ) : (
            <>
              Se habilitará <strong>{disableTarget?.displayName}</strong> para nuevas asignaciones.
            </>
          )
        }
        confirmLabel={disableTarget?.enabled ? 'Deshabilitar' : 'Habilitar'}
        onConfirm={() => void handleToggleEnabled()}
        onCancel={() => setDisableTarget(null)}
      />

      {!isAdmin && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          Consulta en modo solo lectura. La creación y edición requieren rol administrador.
        </p>
      )}
    </div>
  );
};
