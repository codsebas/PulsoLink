// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { FormDialog } from '../src/components/admin/FormDialog';
import { ConfirmDialog } from '../src/components/admin/ConfirmDialog';
import { OptionPagination } from '../src/components/admin/OptionPagination';
import { usePatientOptions } from '../src/features/patients/api';
import { useDeviceOptions } from '../src/features/devices/api';
import { AssignmentsPage } from '../src/features/assignments/AssignmentsPage';
vi.mock('../src/features/auth/useSessionUser', () => ({ useSessionUser: () => ({ data: { role: 'admin' } }) }));

beforeEach(() => {
  // jsdom does not implement the browser's modal/focus algorithms.
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('diálogos administrativos', () => {
  it('Escape respeta el envío pendiente y devuelve el foco al cerrar', () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    const close = vi.fn();
    const { rerender } = render(<FormDialog open title="Editar" onClose={close} onSubmit={vi.fn()} isSubmitting><input aria-label="Código" /></FormDialog>);
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(close).not.toHaveBeenCalled();
    rerender(<FormDialog open title="Editar" onClose={close} onSubmit={vi.fn()}><input aria-label="Código" /></FormDialog>);
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
    rerender(<FormDialog open={false} title="Editar" onClose={close} onSubmit={vi.fn()}><input /></FormDialog>);
    expect(document.activeElement).toBe(trigger); trigger.remove();
  });
  it('la confirmación permite cancelar con Escape y bloquea doble envío', () => {
    const cancel = vi.fn();
    const { rerender } = render(<ConfirmDialog open title="Deshabilitar" message="Conserva historia" onConfirm={vi.fn()} onCancel={cancel} />);
    fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }));
    expect(cancel).toHaveBeenCalledOnce();
    rerender(<ConfirmDialog open title="Deshabilitar" message="Conserva historia" isPending onConfirm={vi.fn()} onCancel={cancel} />);
    expect((screen.getByRole('button', { name: 'Procesando…' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('opciones posteriores a la primera página', () => {
  it('reintenta el cursor fallido en lugar de volver a cargar las páginas sanas', () => {
    const fetchNextPage = vi.fn(), refetch = vi.fn();
    render(<OptionPagination label="pacientes" query={{ isFetching: false, isError: true,
      isFetchNextPageError: true, fetchNextPage, refetch }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar pacientes' }));
    expect(fetchNextPage).toHaveBeenCalledOnce(); expect(refetch).not.toHaveBeenCalled();
  });
  for (const [label, hook, endpoint] of [['pacientes', usePatientOptions, '/patients'], ['placas', useDeviceOptions, '/devices']] as const) {
    it(`conserva los primeros 100 ${label} y usa el cursor opaco para cargar el 101`, async () => {
      const urls: URL[] = [];
      vi.stubGlobal('fetch', vi.fn(async (input) => {
        const url = new URL(String(input), 'http://localhost'); urls.push(url);
        const next = url.searchParams.has('cursor');
        return new Response(JSON.stringify({ data: Array.from({ length: next ? 1 : 100 }, (_, i) => ({ id: String(next ? 101 : i + 1) })),
          pagination: { hasMore: !next, nextCursor: next ? null : 'opaque+/=' } }), { headers: { 'content-type': 'application/json' } });
      }));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
      const { result } = renderHook(() => {
        const query = hook();
        return { isSuccess: query.isSuccess, isFetching: query.isFetching, isError: query.isError,
          hasNextPage: query.hasNextPage, fetchNextPage: () => query.fetchNextPage(), refetch: () => query.refetch(),
          ids: query.data?.pages.flatMap(page => page.data.map(row => row.id)) };
      }, { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const view = render(<OptionPagination label={label} query={result.current} />);
      fireEvent.click(screen.getByRole('button', { name: `Cargar más ${label}` }));
      await waitFor(() => expect(result.current.ids).toHaveLength(101));
      expect(urls[1].pathname.endsWith(endpoint)).toBe(true);
      expect(urls[1].searchParams.get('cursor')).toBe('opaque+/=');
      view.unmount(); act(() => client.clear());
    });
  }
});

it('no cierra una asignación cuando falla la consulta de ocupación', async () => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = new URL(String(input), 'http://localhost'); calls.push(init?.method ?? 'GET');
    if (url.pathname.endsWith('/assignments')) return new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Temporal' } }), { status: 503, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ data: [{ id: 'one', code: 'DEMO', displayName: 'Ficticio' }], pagination: { hasMore: false, nextCursor: null } }), { headers: { 'content-type': 'application/json' } });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AssignmentsPage /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
  const dialog = within(screen.getByRole('dialog'));
  await waitFor(() => expect(dialog.getByLabelText(/Paciente/).querySelector('option[value="one"]')).toBeTruthy());
  fireEvent.change(dialog.getByLabelText(/Paciente/), { target: { value: 'one' } });
  fireEvent.change(dialog.getByLabelText(/Nueva placa/), { target: { value: 'one' } });
  await waitFor(() => expect(screen.getByText('Reintentar asignaciones')).toBeTruthy());
  const submit = screen.getByRole('dialog').querySelector('button[type="submit"]') as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(calls.every(method => method === 'GET')).toBe(true);
  client.clear();
});

it('muestra nombre y código de pacientes y placas deshabilitados en el historial de asignaciones', async () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  const empty = { data: [], pagination: { hasMore: false, nextCursor: null } };
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/assignments')) return json({ data: [{ id: 'asg-old', patientId: 'pat-off', deviceId: 'dev-off',
      startedAt: '2026-10-20T10:00:00Z', endedAt: '2026-10-21T10:00:00Z' }], pagination: { hasMore: false, nextCursor: null } });
    if (url.pathname.endsWith('/patients/pat-off')) return json({ data: { id: 'pat-off', code: 'P-900', displayName: 'Ficticio Archivado', enabled: false } });
    if (url.pathname.endsWith('/devices/dev-off')) return json({ data: { id: 'dev-off', code: 'SIM-900', enabled: false } });
    return json(empty); // los catálogos habilitados no incluyen a los deshabilitados
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AssignmentsPage /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText('Ficticio Archivado (P-900) · deshabilitado')).toBeTruthy());
  expect(screen.getByText('SIM-900 · deshabilitada')).toBeTruthy();
  client.clear();
});
