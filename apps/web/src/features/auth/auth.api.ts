import {
  ApiClientError,
  apiClient,
  fetchCsrfToken,
  setCsrfToken,
} from '../../lib/api-client';
import type { AuthUser } from '../../lib/contract-types';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export async function fetchSessionUser(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    return (await apiClient<AuthUser>('/auth/me', { signal })).data;
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 401) return null;
    throw error;
  }
}

export async function loginRequest(credentials: {
  email: string;
  password: string;
}): Promise<AuthUser> {
  try {
    const response = await apiClient<AuthUser>('/auth/login', {
      method: 'POST',
      json: credentials,
    });
    setCsrfToken(null);
    void fetchCsrfToken().catch(() => undefined);
    return response.data;
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'CSRF_INVALID') {
      setCsrfToken(null);
      await fetchCsrfToken();
      const response = await apiClient<AuthUser>('/auth/login', {
        method: 'POST',
        json: credentials,
      });
      setCsrfToken(null);
      void fetchCsrfToken().catch(() => undefined);
      return response.data;
    }
    throw error;
  }
}

export async function logoutRequest(): Promise<void> {
  await apiClient('/auth/logout', { method: 'POST' });
  setCsrfToken(null);
}
