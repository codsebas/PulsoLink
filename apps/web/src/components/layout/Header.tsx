import React from 'react';
import { Link, NavLink } from 'react-router-dom';
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
} from 'lucide-react';
import { useSessionUser } from '../../features/auth/useSessionUser';

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
  { label: 'Usuarios', path: '/admin/users', icon: UserCog, adminOnly: true },
  { label: 'Auditoría', path: '/admin/audit', icon: ScrollText, adminOnly: true },
  { label: 'Prototipo', path: '/demo', icon: Radio, isDemo: true },
  { label: 'Acceso', path: '/login', icon: ShieldCheck },
];

export const Header: React.FC = () => {
  const { data: user } = useSessionUser();
  const isAdmin = user?.role === 'admin';

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-sm">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-slate-900">PulsoLink</span>
            <span className="hidden lg:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
              IoT Telemétrico
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto" aria-label="Principal">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
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
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                ) : (
                  <Icon className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
