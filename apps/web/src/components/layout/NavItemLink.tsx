import React from 'react';
import { NavLink } from 'react-router-dom';
import type { NavItem } from './navigation';

interface NavItemLinkProps {
  item: NavItem;
  /** `bar`: fila horizontal de escritorio. `menu`: lista del menú móvil, con objetivo táctil de 44 px. */
  variant: 'bar' | 'menu';
}

const layout = {
  bar: 'shrink-0 gap-1.5 px-2.5 py-2 whitespace-nowrap',
  menu: 'w-full min-h-11 gap-3 px-3 py-2.5',
};

export const NavItemLink: React.FC<NavItemLinkProps> = ({ item, variant }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        `flex items-center rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 focus-visible:-outline-offset-2 ${layout[variant]} ${
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
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
        </span>
      ) : (
        <Icon className="w-4 h-4" aria-hidden="true" />
      )}
      <span>{item.label}</span>
    </NavLink>
  );
};
