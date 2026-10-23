import React from 'react';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import type { Assignment } from '../../lib/contract-types';
import { useCloseAssignment } from './api';

interface CloseAssignmentDialogProps {
  assignment: Assignment;
  onClose: () => void;
}

/** Confirmación de cierre de una asignación activa. Se monta solo mientras está abierta. */
export const CloseAssignmentDialog: React.FC<CloseAssignmentDialogProps> = ({ assignment, onClose }) => {
  const closeMutation = useCloseAssignment();

  const handleConfirm = async () => {
    try {
      await closeMutation.mutateAsync(assignment.id);
      onClose();
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  return (
    <ConfirmDialog
      open
      title="Cerrar asignación"
      danger
      isPending={closeMutation.isPending}
      error={closeMutation.error}
      message={
        <>
          Se cerrará la asignación <strong className="font-mono">{assignment.id}</strong> y se liberarán el paciente y la
          placa. Debe no tener sesiones abiertas; el historial no se modifica.
        </>
      }
      confirmLabel="Cerrar asignación"
      onConfirm={() => void handleConfirm()}
      onCancel={onClose}
    />
  );
};
