import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="text-center py-12 space-y-3">
      <h2 className="text-xl font-bold text-slate-800">404 - Página no encontrada</h2>
      <p className="text-sm text-slate-500">La ruta solicitada no existe en la aplicación.</p>
      <Link to="/sessions" className="inline-block text-sm font-semibold text-sky-700 hover:underline">
        Ir a sesiones
      </Link>
    </div>
  );
};
