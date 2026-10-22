import { useEffect, useRef } from 'react';

/** El diálogo nativo aísla el fondo, contiene Tab y devuelve el foco al abrirse/cerrarse. */
export function useDialog(open: boolean, busy: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);
  return {
    ref,
    onCancel: (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      if (!busy) onClose();
    },
  };
}
