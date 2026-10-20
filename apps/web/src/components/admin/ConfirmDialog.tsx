import React from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { formatApiError } from './api-error';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  isPending?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmación para acciones sensibles (deshabilitar, cerrar asignación,
 * finalizar sesión). Bloquea el doble envío y muestra errores de API.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger = false,
  isPending = false,
  error,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={`w-6 h-6 flex-shrink-0 ${danger ? 'text-rose-600' : 'text-amber-500'}`}
            aria-hidden="true"
          />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <div className="text-sm text-slate-600">{message}</div>
          </div>
        </div>

        {error != null && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
            <span>{formatApiError(error)}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`px-4 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            {isPending ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
