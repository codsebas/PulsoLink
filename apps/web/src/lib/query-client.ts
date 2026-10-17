import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './api-client';

const MAX_RETRIES = 2;

/** Reintenta solo fallos de red, 429 y 5xx; los 4xx restantes no cambian al repetirse. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (error instanceof ApiClientError) {
    return error.isNetworkError || error.statusCode === 429 || error.statusCode >= 500;
  }
  return false;
}

/**
 * Instancia única de TanStack Query. Se exporta para que el logout pueda
 * vaciar la caché con `queryClient.clear()` (contrato B §9.7).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
