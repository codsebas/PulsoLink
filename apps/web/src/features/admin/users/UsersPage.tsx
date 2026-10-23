import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { DataTable, type Column } from '../../../components/admin/DataTable';
import { Badge, enabledTone } from '../../../components/admin/Badge';
import { AdminRoute } from '../../../components/admin/AdminRoute';
import { EditToggleActions } from '../../../components/admin/EditToggleActions';
import { ToggleEnabledDialog } from '../../../components/admin/ToggleEnabledDialog';
import { useUsers, useUpdateUser, type UserFilters } from './api';
import type { User } from '../../../lib/contract-types';
import { formatDateTime } from '../../../lib/format';
import { UserFormDialog } from './UserFormDialog';

const EMPTY_FILTERS: UserFilters = { enabled: true };
type OpenDialog = { kind: 'form'; user: User | null } | { kind: 'toggle'; user: User } | null;

const UsersContent: React.FC = () => {
  const [filters, setFilters] = useState<UserFilters>(EMPTY_FILTERS);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const closeDialog = () => setDialog(null);
  const listQuery = useUsers(filters);
  const updateMutation = useUpdateUser();

  const rows = listQuery.data?.pages.flatMap((page) => page.data) ?? [];

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
        <EditToggleActions
          enabled={u.enabled}
          onEdit={() => setDialog({ kind: 'form', user: u })}
          onToggle={() => setDialog({ kind: 'toggle', user: u })}
        />
      ),
    },
  ];

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
            onClick={() => setDialog({ kind: 'form', user: null })}
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

      {dialog?.kind === 'form' && <UserFormDialog user={dialog.user} onClose={closeDialog} />}
      {dialog?.kind === 'toggle' && (
        <ToggleEnabledDialog
          target={dialog.user}
          noun="usuario"
          disableMessage={
            <>
              Se deshabilitará <strong>{dialog.user.displayName}</strong> y se revocarán sus
              sesiones en el servidor.
            </>
          }
          enableMessage={
            <>
              Se habilitará <strong>{dialog.user.displayName}</strong> para volver a iniciar sesión.
            </>
          }
          onConfirm={(u) => updateMutation.mutateAsync({ id: u.id, input: { enabled: !u.enabled } })}
          onClose={closeDialog}
        />
      )}
    </div>
  );
};

export const UsersPage: React.FC = () => (
  <AdminRoute>
    <UsersContent />
  </AdminRoute>
);
