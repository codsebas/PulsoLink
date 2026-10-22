import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  ShieldCheck,
  Radio,
  Clock,
  Users,
  CircuitBoard,
  Link2,
  UserCog,
  ScrollText,
  LogOut,
} from 'lucide-react';
import { useSessionUser } from '../../features/auth/useSessionUser';
import { AUTH_QUERY_KEY, logoutRequest } from '../../features/auth/auth.api';
import { fetchCsrfToken } from '../../lib/api-client';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  isDemo?: boolean;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Estado', path: '/', icon: Activity },
  { label: 'Pacientes', path: '/patients', icon: Users },
  { label: 'Placas', path: '/devices', icon: CircuitBoard },
  { label: 'Asignaciones', path: '/assignments', icon: Link2 },
  { label: 'Sesiones', path: '/sessions', icon: Clock },
  { label: 'Monitoreo', path: '/monitoring', icon: Activity },
  { label: 'Usuarios', path: '/admin/users', icon: UserCog, adminOnly: true },
  { label: 'Auditoría', path: '/admin/audit', icon: ScrollText, adminOnly: true },
  { label: 'Prototipo', path: '/demo', icon: Radio, isDemo: true },
  { label: 'Acceso', path: '/login', icon: ShieldCheck },
];

export const Header: React.FC = () => {
  const session = useSessionUser();
  const user = session.data;
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const visibleItems = navItems.filter((item) =>
    (!item.adminOnly || isAdmin) && !(user && item.path === '/login'));

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await logoutRequest();
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      navigate('/login', { replace: true });
      void fetchCsrfToken().catch(() => undefined);
    } catch {
      setLogoutError('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto min-w-0 px-4 min-h-16 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-sm">
            <Activity className="w-6 h-6 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-slate-900">PulsoLink</span>
            <span className="hidden lg:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
              IoT Telemétrico
            </span>
          </div>
        </Link>

        <p id="nav-scroll-hint" className="w-full text-xs text-slate-600 lg:hidden">Desliza el menú para ver más opciones.</p>
        <nav className="flex w-full min-w-0 max-w-full items-center gap-1 sm:gap-1.5 overflow-x-auto pb-2" aria-label="Principal" aria-describedby="nav-scroll-hint">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 focus-visible:-outline-offset-2 whitespace-nowrap ${
                    item.isDemo
                      ? isActive
                        ? 'bg-rose-100 text-rose-800 font-bold ring-1 ring-rose-300'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold'
                      : isActive
                        ? 'bg-sky-50 text-sky-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                {item.isDemo ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                ) : (
                  <Icon className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {session.data && (
            <div className="ml-1 flex shrink-0 items-center gap-2 border-l border-slate-200 pl-2">
              <span className="hidden text-right sm:block">
                <span className="block text-xs font-semibold text-slate-800">
                  {session.data.displayName}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {session.data.role === 'admin' ? 'Administración' : 'Consulta'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {isLoggingOut ? 'Cerrando…' : 'Salir'}
              </button>
            </div>
          )}
        </nav>
      </div>
      {logoutError && (
        <div role="alert" className="mx-auto max-w-6xl px-4 pb-3 text-sm text-rose-800">
          {logoutError}
        </div>
      )}
    </header>
  );
};
