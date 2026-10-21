import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Lock, Mail, ShieldCheck } from 'lucide-react';
import { ApiClientError } from '../../lib/api-client';
import { AUTH_QUERY_KEY, loginRequest } from './auth.api';

function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) {
    return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  }
  if (error.isNetworkError) {
    return 'No se pudo conectar con la API. Comprueba tu conexión e inténtalo de nuevo.';
  }
  if (error.code === 'INVALID_CREDENTIALS' || error.statusCode === 401) {
    return 'Correo o contraseña incorrectos.';
  }
  if (error.code === 'USER_DISABLED') {
    return 'La cuenta está deshabilitada. Contacta a administración.';
  }
  if (error.code === 'CSRF_INVALID') {
    return 'No se pudo validar el acceso. Recarga la página e inténtalo de nuevo.';
  }
  if (error.statusCode === 403) return 'No tienes permiso para iniciar sesión desde este acceso.';
  if (error.statusCode === 429) {
    return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
  }
  if (error.statusCode === 503) {
    return 'El servicio de acceso no está disponible en este momento. Inténtalo más tarde.';
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

function returnTo(state: unknown): string {
  if (
    state &&
    typeof state === 'object' &&
    'from' in state &&
    typeof (state as { from?: unknown }).from === 'string' &&
    (state as { from: string }).from.startsWith('/') &&
    !(state as { from: string }).from.startsWith('//')
  ) {
    return (state as { from: string }).from;
  }
  return '/monitoring';
}

export const AuthCard: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const errorRef = useRef<HTMLDivElement>(null);

  const login = useMutation({
    mutationFn: loginRequest,
    onSuccess: (user) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
      navigate(returnTo(location.state), { replace: true });
    },
  });

  useEffect(() => {
    if (login.isError) errorRef.current?.focus();
  }, [login.isError]);

  const message = login.isError ? loginErrorMessage(login.error) : null;

  return (
    <div className="max-w-md mx-auto my-8 p-6 bg-white border border-slate-200 rounded-xl shadow-sm space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 bg-sky-100 text-sky-700 rounded-full mx-auto flex items-center justify-center">
          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Acceso a PulsoLink</h1>
        <p className="text-xs text-slate-500">
          Inicio de sesión para personal administrativo y de consulta
        </p>
      </div>

      {message && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-900 flex gap-2"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate({ email: email.trim().toLowerCase(), password });
        }}
        className="space-y-4"
        aria-busy={login.isPending}
      >
        <div>
          <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1">
            Correo electrónico
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@pulsolink.local"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              aria-invalid={login.isError || undefined}
              required
              disabled={login.isPending}
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              aria-invalid={login.isError || undefined}
              required
              disabled={login.isPending}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          {login.isPending ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  );
};
