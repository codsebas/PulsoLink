import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { NotFoundPage } from '../components/layout/NotFoundPage';
import { RouteErrorPage } from '../components/layout/RouteErrorPage';
import { AuthCard } from '../features/auth/AuthCard';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { SessionsPage } from '../features/sessions/SessionsPage';
import { DashboardPage } from '../features/monitoring/DashboardPage';
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
            // "Estado" y "Prototipo" se retiraron (#74): la entrada lleva al monitoreo, que exige sesión.
            index: true,
            element: <Navigate to="/monitoring" replace />,
          },
          {
            path: 'login',
            element: <AuthCard />,
          },
          {
            path: 'demo',
            element: <Navigate to="/monitoring" replace />,
          },
          {
            // Rutas que requieren usuario autenticado (Issue #10 - @Mar-03).
            element: <ProtectedRoute />,
            children: [
              {
                path: 'monitoring',
                lazy: async () => ({ Component: (await import('../features/patient-monitoring/PatientMonitoringPage')).PatientMonitoringIndex }),
              },
              {
                path: 'monitoring/:patientId',
                lazy: async () => ({ Component: (await import('../features/patient-monitoring/PatientMonitoringPage')).PatientMonitoringPage }),
              },
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
