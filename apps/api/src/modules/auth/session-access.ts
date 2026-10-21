import type { AuthUser } from './auth.types.js';

/**
 * Determina si un usuario puede acceder a una sesión de medición.
 *
 * En el modelo objetivo tanto `admin` como `viewer` pueden consultar cualquier
 * sesión autorizada; `viewer` no puede mutarla (lo valida el servicio). El rol
 * legado `operator` se proyecta a `viewer` antes de llegar aquí.
 */
export function canAccessSession(_user: AuthUser, _session: { operatorId: string }): boolean {
  return true;
}
