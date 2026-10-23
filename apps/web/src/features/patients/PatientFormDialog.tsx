import React, { useState } from 'react';
import { z } from 'zod';
import { FormDialog } from '../../components/admin/FormDialog';
import { TextField, zodFieldErrors } from '../../components/admin/FormFields';
import type { Patient } from '../../lib/contract-types';
import { useCreatePatient, useUpdatePatient } from './api';

const patientSchema = z.object({
  code: z.string().trim().min(1, 'Requerido').max(32, 'Máximo 32 caracteres'),
  displayName: z.string().trim().min(1, 'Requerido').max(120, 'Máximo 120 caracteres'),
});

interface PatientFormDialogProps {
  /** `null` para dar de alta un paciente nuevo. */
  patient: Patient | null;
  onClose: () => void;
}

/** Alta y edición de pacientes seudónimos con validación local. Se monta solo mientras está abierto. */
export const PatientFormDialog: React.FC<PatientFormDialogProps> = ({ patient, onClose }) => {
  const [form, setForm] = useState(() => ({ code: patient?.code ?? '', displayName: patient?.displayName ?? '' }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createMutation = useCreatePatient();
  const updateMutation = useUpdatePatient();
  const mutation = patient ? updateMutation : createMutation;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = patientSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed));
      return;
    }
    setFieldErrors({});
    try {
      if (patient) await updateMutation.mutateAsync({ id: patient.id, input: parsed.data });
      else await createMutation.mutateAsync(parsed.data);
      onClose();
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  return (
    <FormDialog
      open
      title={patient ? 'Editar paciente' : 'Nuevo paciente'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={patient ? 'Guardar cambios' : 'Crear paciente'}
      isSubmitting={mutation.isPending}
      error={mutation.error}
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
  );
};
