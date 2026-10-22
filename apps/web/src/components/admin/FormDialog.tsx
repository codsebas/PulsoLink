import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { formatApiError } from './api-error';
import { useDialog } from './useDialog';

interface FormDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  error?: unknown;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Modal de formulario con bloqueo de envío y errores de API visibles.
 * El cierre está deshabilitado mientras la mutación está en curso.
 */
export const FormDialog: React.FC<FormDialogProps> = ({
  open,
  title,
  onClose,
  onSubmit,
  submitLabel = 'Guardar',
  isSubmitting = false,
  error,
  children,
  footer,
}) => {
  const dialog = useDialog(open, isSubmitting, onClose);
  if (!open) return null;

  return (
    <dialog
      {...dialog}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-xl bg-white p-0 shadow-xl backdrop:bg-slate-900/50"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Cerrar"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error != null && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
              <span>{formatApiError(error)}</span>
            </div>
          )}

          {children}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            {footer ?? (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Guardando…' : submitLabel}
              </button>
            )}
          </div>
        </form>
      </div>
    </dialog>
  );
};
