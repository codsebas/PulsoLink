import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, ShieldCheck, Radio, Clock } from 'lucide-react';

export const Header: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { label: 'Estado & Health', path: '/', icon: Activity },
    { label: 'Sesiones', path: '/sessions', icon: Clock },
    { label: 'Acceso', path: '/login', icon: ShieldCheck },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
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

        <nav className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
