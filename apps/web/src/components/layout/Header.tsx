import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, LogOut } from 'lucide-react';
import { useSessionUser } from '../../features/auth/useSessionUser';
import { MobileMenu } from './MobileMenu';
import { NavItemLink } from './NavItemLink';
import { roleLabel, visibleNavItems } from './navigation';
import { useLogout } from './useLogout';

interface LogoutButtonProps {
  onClick: () => void;
  busy: boolean;
  /** En móvil el botón ocupa el objetivo táctil completo de 44 px. */
  touch?: boolean;
}

const LogoutButton: React.FC<LogoutButtonProps> = ({ onClick, busy, touch = false }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    className={`flex items-center gap-1 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400 ${touch ? 'min-h-11' : 'py-1.5'}`}
  >
    <LogOut className="h-4 w-4" aria-hidden="true" />
    {busy ? 'Cerrando…' : 'Salir'}
  </button>
);

/**
 * Cabecera fija. Desde `lg` muestra la fila completa de navegación; por debajo,
 * una barra compacta con "Salir" visible y el menú desplegable (#74, entrega 1).
 */
export const Header: React.FC = () => {
  const { data: user } = useSessionUser();
  const items = visibleNavItems(user);
  const { logout, isLoggingOut, error } = useLogout();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto min-w-0 px-4 py-2.5 lg:min-h-16 lg:py-3 flex flex-wrap items-center justify-between gap-3">
        <Link to="/monitoring" className="flex items-center gap-3 flex-shrink-0">
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

        <MobileMenu
          items={items}
          user={user}
          actions={user && <LogoutButton onClick={() => void logout()} busy={isLoggingOut} touch />}
        />

        <nav className="hidden lg:flex w-full min-w-0 max-w-full items-center gap-1.5 overflow-x-auto pb-2" aria-label="Principal">
          {items.map((item) => (
            <NavItemLink key={item.path} item={item} variant="bar" />
          ))}
          {user && (
            <div className="ml-1 flex shrink-0 items-center gap-2 border-l border-slate-200 pl-2">
              <span className="text-right">
                <span className="block text-xs font-semibold text-slate-800">{user.displayName}</span>
                <span className="block text-[11px] text-slate-500">{roleLabel(user.role)}</span>
              </span>
              <LogoutButton onClick={() => void logout()} busy={isLoggingOut} />
            </div>
          )}
        </nav>
      </div>
      {error && (
        <div role="alert" className="mx-auto max-w-6xl px-4 pb-3 text-sm text-rose-800">
          {error}
        </div>
      )}
    </header>
  );
};
