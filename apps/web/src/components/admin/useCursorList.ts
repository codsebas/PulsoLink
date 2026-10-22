import { useInfiniteQuery } from '@tanstack/react-query';
import { apiList, type ApiListResponse } from '../../lib/api-client';

interface UseCursorListOptions<T> {
  queryKey: readonly unknown[];
  endpoint: string;
  params?: Record<string, string | number | boolean | undefined>;
  enabled?: boolean;
}

/**
 * Listado paginado por cursor opaco (contrato B §7): `getNextPageParam`
 * reenvía `nextCursor` y las páginas se acumulan en el orden del servidor.
 */
export function useCursorList<T>({
  queryKey,
  endpoint,
  params,
  enabled = true,
}: UseCursorListOptions<T>) {
  return useInfiniteQuery<ApiListResponse<T>>({
    queryKey,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      return apiList<T>(endpoint, {
        signal,
        params: { ...params, cursor: pageParam as string | undefined },
      });
    },
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
  });
}
