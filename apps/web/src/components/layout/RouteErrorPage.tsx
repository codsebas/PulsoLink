import React from 'react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

/** Se muestra cuando una pantalla lanza un error durante el render, en lugar de la pantalla por defecto de React Router. */
export const RouteErrorPage: React.FC = () => {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;

  return (
    <div role="alert" className="max-w-md mx-auto my-12 p-6 bg-white border border-rose-200 rounded-xl text-center space-y-3">
      <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" aria-hidden="true" />
      <h2 className="text-lg font-bold text-slate-900">Algo salió mal en esta pantalla</h2>
      {import.meta.env.DEV && detail && (
        <p className="text-xs font-mono text-rose-700 break-words">{detail}</p>
      )}
      <Link to="/" className="inline-block text-sm font-semibold text-sky-700 hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
};
