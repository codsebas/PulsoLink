import React, { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

interface ToggleEnabledDialogProps<T extends { enabled: boolean }> {
  target: T;
  /** Sustantivo para el título: "placa", "usuario", "paciente". */
  noun: string;
  disableMessage: React.ReactNode;
  enableMessage: React.ReactNode;
  /** Cambia `enabled` en la API; si falla, el error se muestra en el diálogo. */
  onConfirm: (target: T) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Confirmación de habilitar/deshabilitar un registro de catálogo. Se monta solo
 * mientras está abierta, así que cada apertura empieza sin error previo.
 */
export function ToggleEnabledDialog<T extends { enabled: boolean }>({
  target,
  noun,
  disableMessage,
  enableMessage,
  onConfirm,
  onClose,
}: ToggleEnabledDialogProps<T>) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const disabling = target.enabled;

  const confirm = async () => {
    setIsPending(true);
    setError(null);
    try {
      await onConfirm(target);
      onClose();
    } catch (cause) {
      setError(cause);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <ConfirmDialog
      open
      title={`${disabling ? 'Deshabilitar' : 'Habilitar'} ${noun}`}
      danger={disabling}
      isPending={isPending}
      error={error}
      message={disabling ? disableMessage : enableMessage}
      confirmLabel={disabling ? 'Deshabilitar' : 'Habilitar'}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    />
  );
}
