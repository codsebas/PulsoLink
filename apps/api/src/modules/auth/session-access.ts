import type { AuthUser } from './auth.types.js';

/**
 * Determina si un usuario puede acceder a una sesión de medición.
 *
 * - `admin` accede a cualquier sesión.
 * - `operator` solo accede a las sesiones que le pertenecen.
 *
 * Cuando devuelve `false`, el endpoint de sesiones debe responder 404 (no 403),
 * para no revelar la existencia de recursos ajenos. Así lo exige el README en
 * la sección 7 ("Recurso inexistente o no visible para ese usuario").
 */
export function canAccessSession(user: AuthUser, session: { operatorId: string }): boolean {
  if (user.role === 'admin') {
    return true;
  }
  return session.operatorId === user.id;
}
