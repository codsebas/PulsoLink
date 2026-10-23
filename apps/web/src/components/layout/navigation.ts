import type React from 'react';
import { Activity, CircuitBoard, Clock, Link2, ScrollText, ShieldCheck, UserCog, Users } from 'lucide-react';
import type { AuthUser } from '../../lib/contract-types';

export interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Pacientes', path: '/patients', icon: Users },
  { label: 'Placas', path: '/devices', icon: CircuitBoard },
  { label: 'Asignaciones', path: '/assignments', icon: Link2 },
  { label: 'Sesiones', path: '/sessions', icon: Clock },
  { label: 'Monitoreo', path: '/monitoring', icon: Activity },
  { label: 'Usuarios', path: '/admin/users', icon: UserCog, adminOnly: true },
  { label: 'Auditoría', path: '/admin/audit', icon: ScrollText, adminOnly: true },
  { label: 'Acceso', path: '/login', icon: ShieldCheck },
];

/**
 * Enlaces visibles según la sesión: las secciones de administración solo para
 * admin (la API también las protege) y "Acceso" solo sin sesión.
 */
export function visibleNavItems(user: AuthUser | null | undefined): NavItem[] {
  const isAdmin = user?.role === 'admin';
  return NAV_ITEMS.filter((item) => (!item.adminOnly || isAdmin) && !(user && item.path === '/login'));
}

export function roleLabel(role: AuthUser['role']): string {
  return role === 'admin' ? 'Administración' : 'Consulta';
}
