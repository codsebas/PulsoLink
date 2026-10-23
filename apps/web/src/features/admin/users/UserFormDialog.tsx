import React, { useState } from 'react';
import { z } from 'zod';
import { FormDialog } from '../../../components/admin/FormDialog';
import { SelectField, TextField, zodFieldErrors } from '../../../components/admin/FormFields';
import type { Role, User } from '../../../lib/contract-types';
import { useCreateUser, useUpdateUser } from './api';

const profileFields = {
  displayName: z.string().trim().min(1, 'Requerido').max(120, 'Máximo 120 caracteres'),
  role: z.enum(['admin', 'viewer']),
};
const createUserSchema = z.object({
  email: z.string().trim().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(128, 'Máximo 128 caracteres'),
  ...profileFields,
});
const updateUserSchema = z.object(profileFields);

const roleOptions = [
  { value: 'viewer', label: 'Viewer (solo consulta)' },
  { value: 'admin', label: 'Administrador' },
];

interface UserFormDialogProps {
  /** `null` para crear una cuenta nueva (correo y contraseña solo en el alta). */
  user: User | null;
  onClose: () => void;
}

/** Alta y edición de usuarios con validación local. Se monta solo mientras está abierto. */
export const UserFormDialog: React.FC<UserFormDialogProps> = ({ user, onClose }) => {
  const [form, setForm] = useState(() => ({
    email: '',
    password: '',
    displayName: user?.displayName ?? '',
    role: user?.role ?? ('viewer' as Role),
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const mutation = user ? updateMutation : createMutation;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = user
      ? updateUserSchema.safeParse({ displayName: form.displayName, role: form.role })
      : createUserSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setFieldErrors({});
    try {
      if (user) await updateMutation.mutateAsync({ id: user.id, input: parsed.data });
      else await createMutation.mutateAsync(parsed.data as z.infer<typeof createUserSchema>);
      onClose();
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  return (
    <FormDialog
      open
      title={user ? 'Editar usuario' : 'Nuevo usuario'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={user ? 'Guardar cambios' : 'Crear usuario'}
      isSubmitting={mutation.isPending}
      error={mutation.error}
    >
      {!user && (
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
  );
};
