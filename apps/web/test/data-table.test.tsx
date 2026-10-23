// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { DataTable, WIDE_TABLE_QUERY, type Column } from '../src/components/admin/DataTable';

interface Row { id: string; name: string; code: string; secret?: string }
const rows: Row[] = [{ id: 'r1', name: 'Paciente uno', code: 'P-1' }, { id: 'r2', name: 'Paciente dos', code: 'P-2' }];
const columns: Column<Row>[] = [
  { key: 'link', header: 'Monitoreo', render: (r) => <a href={`/m/${r.id}`}>Ver {r.name}</a>, mobile: 'actions' },
  { key: 'code', header: 'Código', render: (r) => r.code },
  { key: 'name', header: 'Nombre', render: (r) => r.name, primary: true },
  { key: 'internal', header: 'Interno', render: (r) => `interno-${r.id}`, mobile: 'hidden' },
  { key: 'actions', header: 'Acciones', render: (r) => <button type="button">Editar {r.name}</button> },
];

let listeners: Array<() => void> = [];
function mockViewport(wide: boolean) {
  const state = { wide };
  listeners = [];
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    get matches() { return query === WIDE_TABLE_QUERY ? state.wide : false; },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => { listeners = listeners.filter((l) => l !== fn); },
  })));
  return (next: boolean) => { state.wide = next; act(() => listeners.forEach((fn) => fn())); };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DataTable', () => {
  it('sin matchMedia (jsdom) muestra la tabla de siempre', () => {
    render(<DataTable columns={columns} rows={rows} getKey={(r) => r.id} />);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Monitoreo', 'Código', 'Nombre', 'Interno', 'Acciones']);
  });

  it('en móvil muestra tarjetas: título principal, campos etiquetados y acciones al pie', () => {
    mockViewport(false);
    render(<DataTable columns={columns} rows={rows} getKey={(r) => r.id} />);
    expect(screen.queryByRole('table')).toBeNull();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    const first = within(cards[0]);
    expect(cards[0].firstElementChild?.textContent).toBe('Paciente uno');
    expect(first.getByText('Código').tagName).toBe('DT');
    expect(first.getByText('P-1').tagName).toBe('DD');
    // La columna principal no se repite como campo, y la oculta no aparece.
    expect(first.queryByText('Nombre')).toBeNull();
    expect(first.queryByText('interno-r1')).toBeNull();
    // Enlaces y botones de acción, sin etiqueta, en el pie.
    expect(first.queryByText('Monitoreo')).toBeNull();
    expect(first.queryByText('Acciones')).toBeNull();
    const footer = first.getByRole('button', { name: 'Editar Paciente uno' }).parentElement!;
    expect(within(footer).getByRole('link', { name: 'Ver Paciente uno' })).toBeTruthy();
  });

  it('sin columna principal usa la primera columna de detalle', () => {
    mockViewport(false);
    const plain: Column<Row>[] = [{ key: 'code', header: 'Código', render: (r) => r.code }, { key: 'name', header: 'Nombre', render: (r) => r.name }];
    render(<DataTable columns={plain} rows={rows} getKey={(r) => r.id} />);
    const card = screen.getAllByRole('listitem')[0];
    expect(card.firstElementChild?.textContent).toBe('P-1');
    expect(within(card).getByText('Nombre').tagName).toBe('DT');
  });

  it('cambia de vista al cruzar el breakpoint', () => {
    const setWide = mockViewport(true);
    render(<DataTable columns={columns} rows={rows} getKey={(r) => r.id} />);
    expect(screen.getByRole('table')).toBeTruthy();
    setWide(false);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    setWide(true);
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('conserva estados vacío y "Cargar más" en móvil', () => {
    mockViewport(false);
    const { rerender } = render(<DataTable columns={columns} rows={[]} getKey={(r) => r.id} emptyMessage="Sin pacientes." />);
    expect(screen.getByText('Sin pacientes.')).toBeTruthy();
    const onLoadMore = vi.fn();
    rerender(<DataTable columns={columns} rows={rows} getKey={(r) => r.id} hasMore onLoadMore={onLoadMore} />);
    act(() => screen.getByRole('button', { name: 'Cargar más' }).click());
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
});
