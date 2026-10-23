import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AUTH_QUERY_KEY, logoutRequest } from '../../features/auth/auth.api';
import { fetchCsrfToken } from '../../lib/api-client';

/** Cierra la sesión, vacía la caché (contrato B §9.7) y renueva el token CSRF. */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    setIsLoggingOut(true);
    setError(null);
    try {
      await logoutRequest();
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      navigate('/login', { replace: true });
      void fetchCsrfToken().catch(() => undefined);
    } catch {
      setError('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return { logout, isLoggingOut, error };
}
