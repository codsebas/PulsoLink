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
  // Como el navegador, React puede renderizar entre un listener y el siguiente
  // (vacía las microtareas tras cada uno): un `act` por listener lo reproduce.
  return (next: boolean) => { state.wide = next; [...listeners].forEach((fn) => act(() => fn())); };
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

  // Seguimiento de la revisión de #83.
  const sparse: Column<Row>[] = [
    { key: 'name', header: 'Nombre', render: (r) => r.name },
    { key: 'code', header: 'Código', render: (r) => (r.id === 'r2' ? null : r.code) },
    { key: 'actions', header: 'Acciones', render: (r) => (r.id === 'r2' ? null : <button type="button">Cerrar {r.name}</button>) },
  ];

  it('sin acciones no dibuja el pie y los valores vacíos se muestran como "—"', () => {
    mockViewport(false);
    render(<DataTable columns={sparse} rows={rows} getKey={(r) => r.id} />);
    const [withActions, withoutActions] = screen.getAllByRole('listitem');
    expect(within(withActions).getByRole('button', { name: 'Cerrar Paciente uno' })).toBeTruthy();
    expect(within(withoutActions).queryByRole('button')).toBeNull();
    expect(withoutActions.querySelector('.border-t')).toBeNull();
    expect(within(withoutActions).getByText('Código').nextElementSibling?.textContent).toBe('—');
  });

  it('en la tabla, una celda vacía muestra "—"', () => {
    render(<DataTable columns={sparse} rows={rows} getKey={(r) => r.id} />);
    const secondRow = screen.getAllByRole('row')[2];
    expect(within(secondRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Paciente dos', '—', '—']);
  });

  it('cada tarjeta tiene un encabezado que la nombra', () => {
    mockViewport(false);
    render(<DataTable columns={columns} rows={rows} getKey={(r) => r.id} />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Paciente uno', 'Paciente dos']);
    expect(screen.getByRole('listitem', { name: 'Paciente dos' })).toBeTruthy();
  });

  it('el nivel del encabezado de las tarjetas es configurable', () => {
    mockViewport(false);
    render(<DataTable columns={columns} rows={rows} getKey={(r) => r.id} titleLevel={3} />);
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Paciente uno', 'Paciente dos']);
  });

  it('si el foco estaba dentro al cruzar el breakpoint, pasa al contenedor en vez de perderse', () => {
    const setWide = mockViewport(true);
    render(<DataTable columns={columns} rows={rows} getKey={(r) => r.id} />);
    const button = screen.getByRole('button', { name: 'Editar Paciente uno' });
    act(() => button.focus());
    setWide(false);
    const container = document.activeElement as HTMLElement;
    expect(container).not.toBe(document.body);
    expect(container.getAttribute('tabindex')).toBe('-1');
    expect(container.contains(screen.getAllByRole('listitem')[0])).toBe(true);
  });

  it('sin foco dentro, cruzar el breakpoint no mueve el foco', () => {
    const setWide = mockViewport(true);
    render(<><button type="button">Fuera</button><DataTable columns={columns} rows={rows} getKey={(r) => r.id} /></>);
    const outside = screen.getByRole('button', { name: 'Fuera' });
    act(() => outside.focus());
    setWide(false);
    expect(document.activeElement).toBe(outside);
  });
});
