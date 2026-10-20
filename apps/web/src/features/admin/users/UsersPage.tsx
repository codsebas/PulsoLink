import React, { useState } from 'react';
import { z } from 'zod';
import { UserPlus, Pencil, Power } from 'lucide-react';
import { DataTable, type Column } from '../../../components/admin/DataTable';
import { FormDialog } from '../../../components/admin/FormDialog';
import { ConfirmDialog } from '../../../components/admin/ConfirmDialog';
import { TextField, SelectField, zodFieldErrors } from '../../../components/admin/FormFields';
import { Badge, enabledTone } from '../../../components/admin/Badge';
import { AdminRoute } from '../../../components/admin/AdminRoute';
import { useUsers, useCreateUser, useUpdateUser, type UserFilters } from './api';
import type { User, Role } from '../../../lib/contract-types';
import { formatDateTime } from '../../../lib/format';

const createUserSchema = z.object({
  email: z.string().trim().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(128, 'Máximo 128 caracteres'),
  displayName: z.string().trim().min(1, 'Requerido').max(120, 'Máximo 120 caracteres'),
  role: z.enum(['admin', 'viewer']),
});

const roleOptions = [
  { value: 'viewer', label: 'Viewer (solo consulta)' },
  { value: 'admin', label: 'Administrador' },
];

const EMPTY_FILTERS: UserFilters = { enabled: true };

const UsersContent: React.FC = () => {
  const [filters, setFilters] = useState<UserFilters>(EMPTY_FILTERS);
  const listQuery = useUsers(filters);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'viewer' as Role });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [toggleTarget, setToggleTarget] = useState<User | null>(null);

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();

  const rows = listQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm({ email: '', password: '', displayName: '', role: 'viewer' });
    setFieldErrors({});
    createMutation.reset();
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({ email: '', password: '', displayName: user.displayName, role: user.role });
    setFieldErrors({});
    updateMutation.reset();
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editing) {
      const schema = z.object({
        displayName: z.string().trim().min(1, 'Requerido').max(120, 'Máximo 120 caracteres'),
        role: z.enum(['admin', 'viewer']),
      });
      const parsed = schema.safeParse({ displayName: form.displayName, role: form.role });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed));
        return;
      }
      setFieldErrors({});
      try {
        await updateMutation.mutateAsync({ id: editing.id, input: parsed.data });
        setDialogOpen(false);
      } catch {
        // El error queda expuesto en mutation.error y se muestra en el diálogo.
      }
      return;
    }

    const parsed = createUserSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setFieldErrors({});
    try {
      await createMutation.mutateAsync(parsed.data);
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

  const columns: Column<User>[] = [
    {
      key: 'displayName',
      header: 'Nombre',
      render: (u) => <span className="font-medium">{u.displayName}</span>,
    },
    { key: 'id', header: 'UID', render: (u) => <span className="font-mono text-xs">{u.id}</span> },
    {
      key: 'role',
      header: 'Rol',
      render: (u) => <Badge tone={u.role === 'admin' ? 'sky' : 'slate'}>{u.role}</Badge>,
    },
    {
      key: 'enabled',
      header: 'Estado',
      render: (u) => <Badge tone={enabledTone(u.enabled)}>{u.enabled ? 'Habilitado' : 'Deshabilitado'}</Badge>,
    },
    { key: 'createdAt', header: 'Creado', render: (u) => formatDateTime(u.createdAt) },
    {
      key: 'actions',
      header: 'Acciones',
      render: (u) => (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openEdit(u)}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setToggleTarget(u)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              u.enabled
                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <Power className="w-3.5 h-3.5" aria-hidden="true" />
            {u.enabled ? 'Deshabilitar' : 'Habilitar'}
          </button>
        </div>
      ),
    },
  ];

  const mutationError = editing ? updateMutation.error : createMutation.error;
  const isMutating = editing ? updateMutation.isPending : createMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
          <p className="text-sm text-slate-500">
            Cuentas de acceso a la plataforma. El cambio de rol o inhabilitación revoca sesiones en el
            servidor.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <label htmlFor="users-enabled-filter" className="text-xs font-semibold text-slate-500">
            Estado
          </label>
          <select
            id="users-enabled-filter"
            value={String(filters.enabled ?? true)}
            onChange={(event) =>
              setFilters({ enabled: event.target.value === 'true' })
            }
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="true">Habilitados</option>
            <option value="false">Deshabilitados</option>
          </select>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            Nuevo usuario
          </button>
        </div>
      </div>

      <DataTable<User>
        columns={columns}
        rows={rows}
        getKey={(u) => u.id}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        hasMore={listQuery.hasNextPage}
        isLoadingMore={listQuery.isFetchingNextPage}
        onLoadMore={() => void listQuery.fetchNextPage()}
        emptyMessage="No hay usuarios registrados."
        emptyHint="Crea cuentas de administrador o viewer con correo y contraseña."
      />

      <FormDialog
        open={dialogOpen}
        title={editing ? 'Editar usuario' : 'Nuevo usuario'}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        submitLabel={editing ? 'Guardar cambios' : 'Crear usuario'}
        isSubmitting={isMutating}
        error={mutationError}
      >
        {!editing && (
          <>
            <TextField
              id="user-email"
              label="Correo electrónico"
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              error={fieldErrors.email}
              autoComplete="off"
            />
            <TextField
              id="user-password"
              label="Contraseña"
              type="password"
              required
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              error={fieldErrors.password}
              hint="Mínimo 8 caracteres; nunca se vuelve a mostrar."
              autoComplete="new-password"
            />
          </>
        )}
        <TextField
          id="user-display-name"
          label="Nombre visible"
          required
          value={form.displayName}
          onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
          error={fieldErrors.displayName}
          maxLength={120}
          autoComplete="off"
        />
        <SelectField
          id="user-role"
          label="Rol"
          required
          value={form.role}
          onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as Role }))}
          options={roleOptions}
          hint="Viewer solo consulta; admin administra y consulta auditoría."
        />
      </FormDialog>

      <ConfirmDialog
        open={toggleTarget !== null}
        title={toggleTarget?.enabled ? 'Deshabilitar usuario' : 'Habilitar usuario'}
        danger={toggleTarget?.enabled ?? false}
        isPending={updateMutation.isPending}
        error={updateMutation.error}
        message={
          toggleTarget?.enabled ? (
            <>
              Se deshabilitará <strong>{toggleTarget?.displayName}</strong> y se revocarán sus
              sesiones en el servidor.
            </>
          ) : (
            <>
              Se habilitará <strong>{toggleTarget?.displayName}</strong> para volver a iniciar sesión.
            </>
          )
        }
        confirmLabel={toggleTarget?.enabled ? 'Deshabilitar' : 'Habilitar'}
        onConfirm={() => void handleToggleEnabled()}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
};

export const UsersPage: React.FC = () => (
  <AdminRoute>
    <UsersContent />
  </AdminRoute>
);
