import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Punto de integración de la protección de rutas (Issue #10 - @Mar-03).
 *
 * Por ahora deja pasar todas las rutas. La implementación final debe consultar
 * `GET /auth/me` con TanStack Query y, ante un 401, redirigir a `/login`
 * conservando la ruta de origen. Las rutas hijas no necesitan cambiar.
 */
export const ProtectedRoute: React.FC = () => {
  return <Outlet />;
};
