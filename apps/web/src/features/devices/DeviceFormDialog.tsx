import React, { useState } from 'react';
import { z } from 'zod';
import { FormDialog } from '../../components/admin/FormDialog';
import { SelectField, TextField, zodFieldErrors } from '../../components/admin/FormFields';
import type { Device, DeviceSource } from '../../lib/contract-types';
import { useCreateDevice, useUpdateDevice } from './api';

const deviceSchema = z.object({
  code: z.string().trim().min(1, 'Requerido').max(32, 'Máximo 32 caracteres'),
  source: z.enum(['real', 'simulated']),
  hardwareId: z.string().trim().max(128, 'Máximo 128 caracteres').optional().or(z.literal('')),
});

const sourceOptions = [
  { value: 'simulated', label: 'Simulada' },
  { value: 'real', label: 'Real' },
];

interface DeviceFormDialogProps {
  /** `null` para dar de alta una placa nueva. */
  device: Device | null;
  onClose: () => void;
}

/** Alta y edición de placas con validación local. Se monta solo mientras está abierto. */
export const DeviceFormDialog: React.FC<DeviceFormDialogProps> = ({ device, onClose }) => {
  const [form, setForm] = useState<{ code: string; source: DeviceSource; hardwareId: string }>(() => ({
    code: device?.code ?? '',
    source: device?.source ?? 'simulated',
    hardwareId: device?.hardwareId ?? '',
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateDevice();
  const updateMutation = useUpdateDevice();
  const mutation = device ? updateMutation : createMutation;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = deviceSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setFieldErrors({});
    try {
      if (device) {
        const { source: _source, ...patch } = parsed.data;
        await updateMutation.mutateAsync({
          id: device.id,
          input: { ...patch, ...(patch.hardwareId === '' ? { hardwareId: device.hardwareId ? '' : undefined } : {}) },
        });
      } else {
        await createMutation.mutateAsync({
          code: parsed.data.code,
          source: parsed.data.source,
          ...(parsed.data.hardwareId ? { hardwareId: parsed.data.hardwareId } : {}),
        });
      }
      onClose();
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  return (
    <FormDialog
      open
      title={device ? 'Editar placa' : 'Nueva placa'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={device ? 'Guardar cambios' : 'Crear placa'}
      isSubmitting={mutation.isPending}
      error={mutation.error}
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
        onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value as DeviceSource }))}
        options={sourceOptions}
        disabled={Boolean(device)}
        hint={
          device
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
  );
};
