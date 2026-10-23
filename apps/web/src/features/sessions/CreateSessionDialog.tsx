import React, { useMemo, useState } from 'react';
import { FormDialog } from '../../components/admin/FormDialog';
import { SelectField } from '../../components/admin/FormFields';
import { OptionPagination } from '../../components/admin/OptionPagination';
import type { CatalogOptions, SelectOption } from '../catalog/useCatalogOptions';
import { useAssignments } from '../assignments/api';
import { useCreateSession } from './api';

interface CreateSessionDialogProps {
  catalog: CatalogOptions;
  onClose: () => void;
}

/**
 * Alta de sesión desde una asignación activa. Al montarse (solo mientras está
 * abierto) consulta de nuevo las asignaciones activas.
 */
export const CreateSessionDialog: React.FC<CreateSessionDialogProps> = ({ catalog, onClose }) => {
  const [assignmentId, setAssignmentId] = useState('');
  const activeAssignmentsQuery = useAssignments({ status: 'active' });
  const createMutation = useCreateSession();

  const options = useMemo<SelectOption[]>(
    () =>
      activeAssignmentsQuery.data?.pages.flatMap((page) =>
        page.data.map((assignment) => {
          const patient = catalog.patientNames.get(assignment.patientId) ?? assignment.patientId;
          const device = catalog.deviceCodes.get(assignment.deviceId) ?? assignment.deviceId;
          return { value: assignment.id, label: `${patient} ↔ ${device}` };
        }),
      ) ?? [],
    [activeAssignmentsQuery.data, catalog.patientNames, catalog.deviceCodes],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await createMutation.mutateAsync(assignmentId);
      onClose();
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  return (
    <FormDialog
      open
      title="Nueva sesión de medición"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Crear sesión"
      isSubmitting={createMutation.isPending}
      error={createMutation.error}
    >
      <OptionPagination label="asignaciones" query={activeAssignmentsQuery} />
      <SelectField
        id="session-assignment"
        label="Asignación activa"
        required
        value={assignmentId}
        onChange={(event) => setAssignmentId(event.target.value)}
        options={[{ value: '', label: 'Selecciona una asignación…' }, ...options]}
        hint="El servidor resuelve paciente, placa y origen desde la asignación; no se elige dispositivo manualmente."
      />
    </FormDialog>
  );
};
