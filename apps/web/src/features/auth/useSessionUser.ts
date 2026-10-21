import { useQuery } from '@tanstack/react-query';
import { AUTH_QUERY_KEY, fetchSessionUser } from './auth.api';
import type { AuthUser } from '../../lib/contract-types';

/**
 * Perfil autenticado vía `GET /auth/me` (contrato B).
 * 401 se trata como "sin sesión" sin reintentos; el rol efectivo llega
 * cuando PL2-04 (#28) migre `operator` a `viewer`.
 */
export function useSessionUser() {
  return useQuery<AuthUser | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: ({ signal }) => fetchSessionUser(signal),
    retry: false,
    staleTime: 60_000,
  });
}

/** `true` solo cuando el usuario autenticado tiene rol `admin`. */
export function useIsAdmin(): boolean {
  const { data } = useSessionUser();
  return data?.role === 'admin';
}
