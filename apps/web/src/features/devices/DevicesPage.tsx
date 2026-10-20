import React, { useState } from 'react';
import { z } from 'zod';
import { CircuitBoard, PlusCircle, Pencil, Power } from 'lucide-react';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { FormDialog } from '../../components/admin/FormDialog';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { TextField, SelectField, zodFieldErrors } from '../../components/admin/FormFields';
import { Badge, enabledTone, sourceTone } from '../../components/admin/Badge';
import { useSessionUser } from '../auth/useSessionUser';
import { useDevices, useCreateDevice, useUpdateDevice, type DeviceFilters } from './api';
import type { Device, DeviceSource } from '../../lib/contract-types';
import { formatDateTime } from '../../lib/format';

const createDeviceSchema = z.object({
  code: z.string().trim().min(1, 'Requerido').max(32, 'Máximo 32 caracteres'),
  source: z.enum(['real', 'simulated']),
  hardwareId: z
    .string()
    .trim()
    .max(128, 'Máximo 128 caracteres')
    .optional()
    .or(z.literal('')),
});

const sourceOptions = [
  { value: 'simulated', label: 'Simulada' },
  { value: 'real', label: 'Real' },
];

const EMPTY_FILTERS: DeviceFilters = {};

export const DevicesPage: React.FC = () => {
  const { data: user } = useSessionUser();
  const isAdmin = user?.role === 'admin';

  const [filters, setFilters] = useState<DeviceFilters>(EMPTY_FILTERS);
  const listQuery = useDevices(filters);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState<{ code: string; source: DeviceSource; hardwareId: string }>({
    code: '',
    source: 'simulated',
    hardwareId: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [toggleTarget, setToggleTarget] = useState<Device | null>(null);

  const createMutation = useCreateDevice();
  const updateMutation = useUpdateDevice();

  const rows = listQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', source: 'simulated', hardwareId: '' });
    setFieldErrors({});
    createMutation.reset();
    setDialogOpen(true);
  };

  const openEdit = (device: Device) => {
    setEditing(device);
    setForm({ code: device.code, source: device.source, hardwareId: device.hardwareId ?? '' });
    setFieldErrors({});
    updateMutation.reset();
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = createDeviceSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setFieldErrors({});

    try {
      if (editing) {
        const { source: _source, ...patch } = parsed.data;
        await updateMutation.mutateAsync({
          id: editing.id,
          input: {
            ...patch,
            ...(patch.hardwareId === '' ? { hardwareId: undefined } : {}),
          },
        });
      } else {
        await createMutation.mutateAsync({
          code: parsed.data.code,
          source: parsed.data.source,
          ...(parsed.data.hardwareId ? { hardwareId: parsed.data.hardwareId } : {}),
        });
      }
      setDialogOpen(false);
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  const handleToggleEnabled = async () => {
    if (!toggleTarget) return;
    try {
      await updateMutation.mutateAsync({
        id: toggleTarget.id,
        input: { enabled: !toggleTarget.enabled },
      });
      setToggleTarget(null);
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(d)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setToggleTarget(d)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    d.enabled
                      ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" aria-hidden="true" />
                  {d.enabled ? 'Deshabilitar' : 'Habilitar'}
                </button>
              </div>
            ),
          } satisfies Column<Device>,
        ]
      : []),
  ];

  const mutationError = editing ? updateMutation.error : createMutation.error;
  const isMutating = editing ? updateMutation.isPending : createMutation.isPending;

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
              onClick={openCreate}
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

      <FormDialog
        open={dialogOpen}
        title={editing ? 'Editar placa' : 'Nueva placa'}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        submitLabel={editing ? 'Guardar cambios' : 'Crear placa'}
        isSubmitting={isMutating}
        error={mutationError}
      >
        <TextField
          id="device-code"
          label="Código"
          required
          value={form.code}
          onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
          error={fieldErrors.code}
          maxLength={32}
          autoComplete="off"
        />
        <SelectField
          id="device-source"
          label="Origen"
          required
          value={form.source}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, source: event.target.value as DeviceSource }))
          }
          options={sourceOptions}
          disabled={Boolean(editing)}
          hint={
            editing
              ? 'El origen no se modifica una vez registrada la placa con historia.'
              : 'Las placas simuladas envían por el mismo contrato A que las reales.'
          }
        />
        <TextField
          id="device-hardware-id"
          label="Hardware ID (opcional)"
          value={form.hardwareId}
          onChange={(event) => setForm((prev) => ({ ...prev, hardwareId: event.target.value }))}
          error={fieldErrors.hardwareId}
          maxLength={128}
          autoComplete="off"
        />
      </FormDialog>

      <ConfirmDialog
        open={toggleTarget !== null}
        title={toggleTarget?.enabled ? 'Deshabilitar placa' : 'Habilitar placa'}
        danger={toggleTarget?.enabled ?? false}
        isPending={updateMutation.isPending}
        error={updateMutation.error}
        message={
          toggleTarget?.enabled ? (
            <>
              Se deshabilitará la placa <strong>{toggleTarget.code}</strong>. Si tiene una asignación
              activa la API responderá con un conflicto; el historial se conserva.
            </>
          ) : (
            <>
              Se habilitará la placa <strong>{toggleTarget?.code}</strong> para nuevas asignaciones.
            </>
          )
        }
        confirmLabel={toggleTarget?.enabled ? 'Deshabilitar' : 'Habilitar'}
        onConfirm={() => void handleToggleEnabled()}
        onCancel={() => setToggleTarget(null)}
      />

      {!isAdmin && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <CircuitBoard className="w-3.5 h-3.5" aria-hidden="true" />
          Consulta en modo solo lectura. La creación y edición requieren rol administrador.
        </p>
      )}
    </div>
  );
};
