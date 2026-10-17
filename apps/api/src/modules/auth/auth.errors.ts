import { AppError } from '../../middleware/error-handler.js';

/**
 * Catálogo de errores del módulo de autenticación (contrato B, README sección 9).
 *
 * HTTP  code                    cuándo
 * 400   VALIDATION_ERROR        Cuerpo de login inválido o JSON malformado
 * 401   INVALID_CREDENTIALS     Correo inexistente, contraseña incorrecta o
 *                               usuario deshabilitado en Firebase Auth
 * 401   UNAUTHENTICATED         Sin cookie, cookie inválida/vencida/revocada o
 *                               usuario sin documento en users/{uid}
 * 403   USER_DISABLED           users/{uid}.enabled === false
 * 403   FORBIDDEN               Rol insuficiente
 * 403   CSRF_INVALID            Token CSRF ausente/inválido u origen no permitido
 * 413   PAYLOAD_TOO_LARGE       Cuerpo de la petición demasiado grande (8 KiB)
 * 429   TOO_MANY_ATTEMPTS       Límite de intentos o Firebase TOO_MANY_ATTEMPTS_TRY_LATER
 * 503   AUTH_UNAVAILABLE        Firebase no responde o devuelve 5xx
 *
 * `AuthError` extiende `AppError` para que el manejador global de errores del
 * esqueleto (`middleware/error-handler.ts`) aplique el formato acordado sin que
 * el módulo registre su propio manejador.
 */
export class AuthError extends AppError {
  /** Alias de `statusCode` conservado por compatibilidad con el módulo. */
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(code, message, status);
    this.name = 'AuthError';
    this.status = status;
  }
}
