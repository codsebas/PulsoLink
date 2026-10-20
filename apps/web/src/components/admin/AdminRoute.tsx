import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { LoadingState } from '../feedback/LoadingState';
import { ErrorState } from '../feedback/ErrorState';
import { useSessionUser } from '../../features/auth/useSessionUser';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * Protege rutas administrativas en la UI (usuarios y auditoría).
 * La API aplica la autorización de forma independiente (403 al viewer);
 * este guard solo evita mostrar pantallas que el rol no puede usar.
 */
export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { data: user, isLoading, isError, error, refetch } = useSessionUser();

  if (isLoading) {
    return <LoadingState label="Verificando acceso…" />;
  }

  // Un fallo de red o del servidor no significa "sin sesión": se ofrece reintentar.
  if (isError) {
    return <ErrorState error={error} title="No se pudo verificar tu sesión" onRetry={() => void refetch()} />;
  }

  if (!user) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" aria-hidden="true" />
        <h2 className="text-lg font-bold text-slate-900">Se requiere iniciar sesión</h2>
        <p className="text-sm text-slate-500">
          Inicia sesión para acceder a esta sección.
        </p>
        <Link
          to="/login"
          className="inline-flex px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          Ir a acceso
        </Link>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" aria-hidden="true" />
        <h2 className="text-lg font-bold text-slate-900">Acceso restringido</h2>
        <p className="text-sm text-slate-500">
          Esta sección es solo para administradores. Tu rol actual es{' '}
          <strong>{user.role}</strong>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
