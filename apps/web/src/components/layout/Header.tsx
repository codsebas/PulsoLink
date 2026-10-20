import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Activity, ShieldCheck, Radio, Clock } from 'lucide-react';

export const Header: React.FC = () => {
  const navItems = [
    { label: 'Estado & Health', path: '/', icon: Activity, isDemo: false },
    { label: 'Prototipo en Vivo', path: '/demo', icon: Radio, isDemo: true },
    { label: 'Sesiones', path: '/sessions', icon: Clock, isDemo: false },
    { label: 'Monitoreo', path: '/monitoring', icon: Activity, isDemo: false },
    { label: 'Acceso', path: '/login', icon: ShieldCheck, isDemo: false },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 min-h-16 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-sm">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-slate-900">PulsoLink</span>
            <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
              IoT Telemétrico
            </span>
          </div>
        </Link>

        <nav className="flex max-w-full items-center gap-1 overflow-x-auto sm:gap-2" aria-label="Navegación principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex shrink-0 whitespace-nowrap items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
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
