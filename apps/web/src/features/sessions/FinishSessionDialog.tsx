import React from 'react';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import type { Session } from '../../lib/contract-types';
import { useFinishSession } from './api';

interface FinishSessionDialogProps {
  session: Session;
  onClose: () => void;
}

/** Confirmación para finalizar una sesión activa. Se monta solo mientras está abierta. */
export const FinishSessionDialog: React.FC<FinishSessionDialogProps> = ({ session, onClose }) => {
  const finishMutation = useFinishSession();

  const handleConfirm = async () => {
    try {
      await finishMutation.mutateAsync(session.id);
      onClose();
    } catch {
      // El error queda expuesto en mutation.error y se muestra en el diálogo.
    }
  };

  return (
    <ConfirmDialog
      open
      title="Finalizar sesión"
      danger
      isPending={finishMutation.isPending}
      error={finishMutation.error}
      message={
        <>
          Se finalizará la sesión <strong className="font-mono">{session.id}</strong> y la placa dejará de poder enviar
          mediciones nuevas. No se reabre.
        </>
      }
      confirmLabel="Finalizar"
      onConfirm={() => void handleConfirm()}
      onCancel={onClose}
    />
  );
};
