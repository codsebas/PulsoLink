import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type { AuthUser } from '../../lib/contract-types';

/**
 * Perfil autenticado vía `GET /auth/me` (contrato B).
 * 401 se trata como "sin sesión" sin reintentos; el rol efectivo llega
 * cuando PL2-04 (#28) migre `operator` a `viewer`.
 */
export function useSessionUser() {
  return useQuery<AuthUser | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const res = await apiClient<AuthUser>('/auth/me');
        return res.data;
      } catch (error) {
        if (
          error instanceof Error &&
          'statusCode' in error &&
          (error as { statusCode: number }).statusCode === 401
        ) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

/** `true` solo cuando el usuario autenticado tiene rol `admin`. */
export function useIsAdmin(): boolean {
  const { data } = useSessionUser();
  return data?.role === 'admin';
}
