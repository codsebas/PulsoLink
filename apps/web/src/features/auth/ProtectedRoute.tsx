import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSessionUser } from './useSessionUser';
import { LoadingState } from '../../components/feedback/LoadingState';
import { ErrorState } from '../../components/feedback/ErrorState';

/**
 * Protección de rutas basada en `GET /auth/me`. Un 401 se traduce en ausencia
 * de sesión y redirección; un fallo de red o 5xx nunca se interpreta como
 * "sin sesión" ni muestra contenido protegido.
 */
export const ProtectedRoute: React.FC = () => {
  const location = useLocation();
  const session = useSessionUser();

  if (session.isPending) {
    return <LoadingState label="Verificando la sesión…" />;
  }

  if (session.isError) {
    return (
      <ErrorState error={session.error} title="No se pudo verificar la sesión" onRetry={() => void session.refetch()} />
    );
  }

  if (!session.data) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Outlet />;
};
