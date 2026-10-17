import React from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { HomePage } from '../features/home/HomePage';
import { AuthCard } from '../features/auth/AuthCard';
import { SessionsPage } from '../features/sessions/SessionsPage';
import { DashboardPage } from '../features/monitoring/DashboardPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
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
        path: 'sessions',
        element: <SessionsPage />,
      },
      {
        path: 'sessions/:id',
        element: <DashboardPage />,
      },
      {
        path: '*',
        element: (
          <div className="text-center py-12 space-y-3">
            <h2 className="text-xl font-bold text-slate-800">404 - Página no encontrada</h2>
            <p className="text-sm text-slate-500">La ruta solicitada no existe en la aplicación.</p>
          </div>
        ),
      },
    ],
  },
]);
