import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ApiClientError } from '../../lib/api-client';

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}

/** Traduce el error a un mensaje para el usuario sin exponer detalles internos. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.isNetworkError) return error.message;
    switch (error.statusCode) {
      case 401:
        return 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.';
      case 403:
        return 'No tienes permiso para realizar esta acción.';
      case 404:
        return 'El recurso solicitado no existe o no es visible para tu usuario.';
      case 429:
        return 'Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.';
      default:
        return error.message;
    }
  }
  return 'Ocurrió un error inesperado.';
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  title = 'No se pudieron cargar los datos',
  onRetry,
}) => {
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;

  return (
    <div
      role="alert"
      className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex gap-3"
    >
      <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        <p className="font-semibold">{title}</p>
        <p>{getErrorMessage(error)}</p>
        {requestId && <p className="text-rose-600 font-mono">Referencia: {requestId}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 rounded-lg font-semibold transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Reintentar
        </button>
      )}
    </div>
  );
};
