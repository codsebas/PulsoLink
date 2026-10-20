import React from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { NotFoundPage } from '../components/layout/NotFoundPage';
import { RouteErrorPage } from '../components/layout/RouteErrorPage';
import { HomePage } from '../features/home/HomePage';
import { AuthCard } from '../features/auth/AuthCard';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { SessionsPage } from '../features/sessions/SessionsPage';
import { DashboardPage } from '../features/monitoring/DashboardPage';
import { LiveMockupPage } from '../features/demo/LiveMockupPage';
import { PatientsPage } from '../features/patients/PatientsPage';
import { DevicesPage } from '../features/devices/DevicesPage';
import { AssignmentsPage } from '../features/assignments/AssignmentsPage';
import { UsersPage } from '../features/admin/users/UsersPage';
import { AuditPage } from '../features/admin/audit/AuditPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        // Los errores de una pantalla se muestran dentro del layout, sin perder la navegación.
        errorElement: <RouteErrorPage />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
          {
            path: 'login',
            element: <AuthCard />,
          },
          {
            path: 'demo',
            element: <LiveMockupPage />,
          },
          {
            // Rutas que requieren usuario autenticado (Issue #10 - @Mar-03).
            element: <ProtectedRoute />,
            children: [
              {
                path: 'sessions',
                element: <SessionsPage />,
              },
              {
                path: 'sessions/:id',
                element: <DashboardPage />,
              },
              {
                // PL2-06 (#30): listados administrativos. La autorización fuerte
                // vive en la API; aquí se muestra la sección según rol.
                path: 'patients',
                element: <PatientsPage />,
              },
              {
                path: 'devices',
                element: <DevicesPage />,
              },
              {
                path: 'assignments',
                element: <AssignmentsPage />,
              },
              {
                path: 'admin/users',
                element: <UsersPage />,
              },
              {
                path: 'admin/audit',
                element: <AuditPage />,
              },
            ],
          },
          {
            path: '*',
            element: <NotFoundPage />,
          },
        ],
      },
    ],
  },
]);
