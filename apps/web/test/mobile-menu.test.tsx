// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { MobileMenu } from '../src/components/layout/MobileMenu';
import { NAV_ITEMS, visibleNavItems } from '../src/components/layout/navigation';
import type { AuthUser } from '../src/lib/contract-types';

afterEach(cleanup);

const admin: AuthUser = { id: 'u-admin', displayName: 'Admin QA', role: 'admin' };
const viewer: AuthUser = { id: 'u-viewer', displayName: 'Consulta QA', role: 'viewer' };

let navigateTo: NavigateFunction = () => undefined;
const Where = () => {
  navigateTo = useNavigate();
  return <p data-testid="where">{useLocation().pathname}</p>;
};
function renderMenu(user: AuthUser | null = admin) {
  return render(
    <MemoryRouter initialEntries={['/patients']}>
      <div>
        <header>
          <MobileMenu items={visibleNavItems(user)} user={user} actions={<button type="button">Salir</button>} />
        </header>
        <main>
          <Routes><Route path="*" element={<Where />} /></Routes>
        </main>
      </div>
    </MemoryRouter>,
  );
}
const toggle = () => screen.getByRole('button', { name: 'Menú' });
const panel = () => screen.queryByRole('navigation', { name: 'Principal' });

describe('visibleNavItems', () => {
  it('muestra administración solo a admin y oculta Acceso con sesión', () => {
    const labels = (user: AuthUser | null) => visibleNavItems(user).map((item) => item.label);
    expect(labels(admin)).toEqual(expect.arrayContaining(['Usuarios', 'Auditoría']));
    expect(labels(admin)).not.toContain('Acceso');
    expect(labels(viewer)).not.toEqual(expect.arrayContaining(['Usuarios']));
    expect(labels(viewer)).not.toContain('Auditoría');
    expect(labels(null)).toContain('Acceso');
    expect(labels(null)).toHaveLength(NAV_ITEMS.length - 2);
  });
});

describe('MobileMenu', () => {
  it('abre con aria-expanded, enfoca el primer enlace y muestra la identidad', () => {
    renderMenu();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    const nav = panel()!;
    expect(toggle().getAttribute('aria-controls')).toBe(nav.id);
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Estado' }));
    expect(nav.textContent).toContain('Admin QA');
    expect(nav.textContent).toContain('Administración');
  });

  it('aria-controls apunta a un elemento existente también con el menú cerrado', () => {
    renderMenu();
    const target = document.getElementById(toggle().getAttribute('aria-controls')!);
    expect(target).not.toBeNull();
    expect(target!.hidden).toBe(true);
  });

  it('Escape cierra y devuelve el foco al botón', () => {
    renderMenu();
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('el tabulador circula entre "Salir", el botón y los enlaces sin salir del menú', () => {
    renderMenu();
    fireEvent.click(toggle());
    const links = screen.getAllByRole('link');
    const salir = screen.getByRole('button', { name: 'Salir' });
    links[links.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(salir);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(links[links.length - 1]);
  });

  it('elegir un enlace navega y cierra el menú', () => {
    renderMenu();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('link', { name: 'Asignaciones' }));
    expect(screen.getByTestId('where').textContent).toBe('/assignments');
    expect(panel()).toBeNull();
  });

  it('un cambio de ruta por otra vía (atrás, redirección) también lo cierra', () => {
    renderMenu();
    fireEvent.click(toggle());
    act(() => { void navigateTo('/login'); });
    expect(screen.getByTestId('where').textContent).toBe('/login');
    expect(panel()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('con el menú abierto el resto de la página queda inerte y sin desplazamiento', () => {
    renderMenu();
    const main = document.querySelector('main')!;
    fireEvent.click(toggle());
    expect(main.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(main.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('tocar fuera del panel lo cierra', () => {
    renderMenu();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByTestId('mobile-menu-backdrop'));
    expect(panel()).toBeNull();
  });

  it('el viewer no ve enlaces de administración en el menú', () => {
    renderMenu(viewer);
    fireEvent.click(toggle());
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Auditoría' })).toBeNull();
    expect(panel()!.textContent).toContain('Consulta');
  });
});
