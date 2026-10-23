// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MobileMenu } from '../src/components/layout/MobileMenu';
import { NAV_ITEMS, visibleNavItems } from '../src/components/layout/navigation';
import type { AuthUser } from '../src/lib/contract-types';

afterEach(cleanup);

const admin: AuthUser = { id: 'u-admin', displayName: 'Admin QA', role: 'admin' };
const viewer: AuthUser = { id: 'u-viewer', displayName: 'Consulta QA', role: 'viewer' };

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
function renderMenu(user: AuthUser | null = admin) {
  return render(
    <MemoryRouter initialEntries={['/patients']}>
      <MobileMenu items={visibleNavItems(user)} user={user} />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}
const toggle = () => screen.getByRole('button', { name: 'Menú' });

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
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(toggle().getAttribute('aria-controls')).toBe(nav.id);
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Estado' }));
    expect(nav.textContent).toContain('Admin QA');
    expect(nav.textContent).toContain('Administración');
  });

  it('Escape cierra y devuelve el foco al botón', () => {
    renderMenu();
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('el tabulador circula entre el botón y los enlaces sin salir del menú', () => {
    renderMenu();
    fireEvent.click(toggle());
    const links = screen.getAllByRole('link');
    links[links.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(toggle());
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(links[links.length - 1]);
  });

  it('elegir un enlace navega y cierra el menú', () => {
    renderMenu();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('link', { name: 'Asignaciones' }));
    expect(screen.getByTestId('where').textContent).toBe('/assignments');
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
  });

  it('tocar fuera del panel lo cierra', () => {
    const { container } = renderMenu();
    fireEvent.click(toggle());
    fireEvent.click(container.querySelector('[aria-hidden="true"].absolute') as Element);
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
  });

  it('el viewer no ve enlaces de administración en el menú', () => {
    renderMenu(viewer);
    fireEvent.click(toggle());
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Auditoría' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Principal' }).textContent).toContain('Consulta');
  });
});
