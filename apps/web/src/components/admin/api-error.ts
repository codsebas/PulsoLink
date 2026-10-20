import { ApiClientError, NETWORK_ERROR_CODE } from '../../lib/api-client';

const CONFLICT_MESSAGES: Record<string, string> = {
  ASSIGNMENT_IN_USE:
    'La asignación tiene sesiones abiertas. Finaliza las sesiones antes de cerrar o deshabilitar.',
  ASSIGNMENT_CONFLICT:
    'El paciente o la placa ya tienen una asignación activa. Cierra la asignación existente antes de crear otra.',
  DEVICE_BUSY: 'La placa ya tiene una sesión activa en este momento.',
  SESSION_NOT_ACTIVE: 'La sesión ya no está activa. Recarga el listado para ver su estado actual.',
  ASSIGNMENT_NOT_ACTIVE: 'La asignación asociada a la sesión ya no está activa.',
  IDEMPOTENCY_CONFLICT: 'La operación duplicó una clave con contenido distinto. Recarga e inténtalo de nuevo.',
};

/**
 * Traduce un error de la API a un mensaje visible para la persona usuaria.
 * Los códigos de conflicto del contrato B reciben una instrucción concreta.
 */
export function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.isNetworkError) {
      return 'No se pudo conectar con la API. Comprueba que el backend esté en ejecución.';
    }
    if (error.code === NETWORK_ERROR_CODE) {
      return error.message;
    }
    const conflictMessage = CONFLICT_MESSAGES[error.code];
    if (conflictMessage) return conflictMessage;
    if (error.statusCode === 401) {
      return 'Tu sesión expiró o no iniciaste sesión. Vuelve a iniciar sesión.';
    }
    if (error.statusCode === 403) {
      return 'No tienes permiso para esta operación. Se requiere rol administrador.';
    }
    if (error.statusCode === 404) {
      return 'El recurso no existe o ya no está disponible.';
    }
    return error.message || 'La operación falló.';
  }
  if (error instanceof Error) return error.message;
  return 'La operación falló de forma inesperada.';
}
