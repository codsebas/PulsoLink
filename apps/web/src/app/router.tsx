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
