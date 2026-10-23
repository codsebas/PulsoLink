import React, { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import type { AuthUser } from '../../lib/contract-types';
import { NavItemLink } from './NavItemLink';
import { roleLabel, type NavItem } from './navigation';

interface MobileMenuProps {
  items: readonly NavItem[];
  user: AuthUser | null | undefined;
  /** Controles siempre visibles junto al botón (p. ej. "Salir"); forman parte del ciclo de foco. */
  actions?: React.ReactNode;
}

const DESKTOP_QUERY = '(min-width: 1024px)'; // breakpoint `lg` de Tailwind
const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * Menú desplegable para pantallas menores de `lg`. Mientras está abierto, el
 * foco circula entre las acciones, el botón y los enlaces; el resto de la
 * página queda inerte y sin desplazamiento. Escape cierra y devuelve el foco
 * al botón. Se cierra al cambiar de ruta (enlace, atrás/adelante o
 * redirección), al tocar fuera o al pasar a escritorio.
 */
export const MobileMenu: React.FC<MobileMenuProps> = ({ items, user, actions }) => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [openedAt, setOpenedAt] = useState(pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();

  // Cualquier cambio de ruta cierra el menú; se deriva en el render, sin efecto.
  if (pathname !== openedAt) {
    setOpenedAt(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !root) return;
      const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const desktop = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null;
    const onBreakpoint = () => { if (desktop?.matches) setOpen(false); };
    desktop?.addEventListener('change', onBreakpoint);

    // Fondo inerte y sin desplazamiento: todo lo que no sea la cabecera.
    const header = root?.closest('header');
    const background = header?.parentElement
      ? [...header.parentElement.children].filter((el): el is HTMLElement => el !== header && el instanceof HTMLElement)
      : [];
    background.forEach((el) => el.setAttribute('inert', ''));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      desktop?.removeEventListener('change', onBreakpoint);
      background.forEach((el) => el.removeAttribute('inert'));
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const closeOnLink = (event: React.MouseEvent) => {
    if ((event.target as Element).closest('a')) setOpen(false);
  };

  return (
    <div ref={rootRef} className="flex items-center gap-1 lg:hidden">
      {actions}
      <button
        ref={toggleRef}
        type="button"
        aria-label="Menú"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
      </button>
      {open && (
        <div
          data-testid="mobile-menu-backdrop"
          className="absolute inset-x-0 top-full h-screen bg-slate-900/30"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
      <nav
        id={panelId}
        ref={panelRef}
        aria-label="Principal"
        hidden={!open}
        onClick={closeOnLink}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain border-b border-slate-200 bg-white shadow-lg"
      >
        {/* El <nav> existe siempre para que aria-controls tenga destino; su contenido solo cuando está abierto. */}
        {open && (
          <div className="mx-auto max-w-6xl px-4 py-3">
            {user && (
              <p className="px-3 pb-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{user.displayName}</span> · {roleLabel(user.role)}
              </p>
            )}
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.path}>
                  <NavItemLink item={item} variant="menu" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </div>
  );
};
