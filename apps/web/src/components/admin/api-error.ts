import { ApiClientError } from '../../lib/api-client';
import { getErrorMessage } from '../feedback/ErrorState';

/**
 * Traduce un error de la API a un mensaje visible para la persona usuaria.
 * Delega en `getErrorMessage` para no duplicar el mapeo de códigos y estados.
 */
export function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError && error.isNetworkError) {
    return 'No se pudo conectar con la API. Comprueba que el backend esté en ejecución.';
  }
  if (error instanceof ApiClientError) {
    return getErrorMessage(error);
  }
  if (error instanceof Error) return error.message;
  return 'La operación falló de forma inesperada.';
}
