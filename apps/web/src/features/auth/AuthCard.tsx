import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, AlertCircle } from 'lucide-react';

export const AuthCard: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(
      'Módulo de autenticación en desarrollo por @Mar-03 (Issue #10).\nVerificará credenciales con Firebase Auth en backend y creará cookie HttpOnly con CSRF.'
    );
  };

  return (
    <div className="max-w-md mx-auto my-8 p-6 bg-white border border-slate-200 rounded-xl shadow-sm space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 bg-sky-100 text-sky-700 rounded-full mx-auto flex items-center justify-center">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Acceso a PulsoLink</h2>
        <p className="text-xs text-slate-500">
          Inicio de sesión seguro para Operadores y Administradores
        </p>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
        <div>
          <strong>Punto de integración (Issue #10 - @Mar-03):</strong> Flujo de login con cookie HttpOnly y token CSRF.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Correo Electrónico</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operador@pulsolink.local"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Contraseña</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          Iniciar Sesión
        </button>
      </form>
    </div>
  );
};
