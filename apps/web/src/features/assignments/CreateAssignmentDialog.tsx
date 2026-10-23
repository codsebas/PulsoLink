import React, { useState } from 'react';
import { FormDialog } from '../../components/admin/FormDialog';
import { SelectField } from '../../components/admin/FormFields';
import { OptionPagination } from '../../components/admin/OptionPagination';
import type { CatalogOptions } from '../catalog/useCatalogOptions';
import { useCreateAssignment } from './api';

interface CreateAssignmentDialogProps {
  catalog: CatalogOptions;
  onClose: () => void;
}

/** Alta de asignación paciente ↔ placa. Se monta solo mientras está abierto. */
export const CreateAssignmentDialog: React.FC<CreateAssignmentDialogProps> = ({ catalog, onClose }) => {
  const [form, setForm] = useState({ patientId: '', deviceId: '' });
  const createMutation = useCreateAssignment();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await createMutation.mutateAsync(form);
      onClose();
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  return (
    <FormDialog
      open
      title="Asignar placa a paciente"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Asignar"
      isSubmitting={createMutation.isPending}
      error={createMutation.error}
    >
      <OptionPagination label="pacientes" query={catalog.patientsQuery} />
      <OptionPagination label="placas" query={catalog.devicesQuery} />
      <SelectField
        id="assignment-patient"
        label="Paciente"
        required
        value={form.patientId}
        onChange={(event) => setForm((prev) => ({ ...prev, patientId: event.target.value }))}
        options={[{ value: '', label: 'Selecciona un paciente…' }, ...catalog.patientOptions]}
      />
      <SelectField
        id="assignment-device"
        label="Placa"
        required
        value={form.deviceId}
        onChange={(event) => setForm((prev) => ({ ...prev, deviceId: event.target.value }))}
        options={[{ value: '', label: 'Selecciona una placa…' }, ...catalog.deviceOptions]}
        hint="Solo placas habilitadas. Si el paciente o la placa ya están ocupados, la API responde con un conflicto."
      />
    </FormDialog>
  );
};
