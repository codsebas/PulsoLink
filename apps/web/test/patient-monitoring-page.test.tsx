// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientMonitoringPage } from '../src/features/patient-monitoring/PatientMonitoringPage';
import type { PatientMeasurement } from '../src/features/patient-monitoring/patient-monitoring.types';
import { reading } from './helpers';

/**
 * Verificación de integración de la capa de datos en la pantalla de monitoreo:
 * la vista consume los hooks y no llamadas sueltas a la API.
 */

const patientId = 'patient-1';
const readings: PatientMeasurement[] = Array.from({ length: 120 }, (_, index) =>
  reading({ id: `m${String(index).padStart(3, '0')}`, receivedAt: new Date(Date.parse('2026-10-19T10:00:00.000Z') - index * 1000).toISOString() })
);

const original = globalThis.fetch;
// Recharts mide el contenedor con ResizeObserver, que jsdom no implementa.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const activeSession = { id: 'session-1', patientId, deviceId: 'device-1', assignmentId: 'assignment-1', status: 'active' };

function installFetch(overrides: { measurements?: (url: URL) => unknown; sessions?: () => unknown[] } = {}) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    calls.push(raw);
    const url = new URL(raw, 'http://localhost:3001');
    const path = url.pathname;
    if (path.endsWith('/auth/csrf')) return json({ data: { csrfToken: 'csrf-de-prueba' } });
    if (path.endsWith('/auth/me')) return json({ data: { id: 'viewer-1', displayName: 'Consulta demo', role: 'viewer' } });
    if (path.endsWith('/access')) return json({ data: { eventId: 'event-1', duplicate: false } }, 201);
    if (path.endsWith('/latest')) {
      return json({ data: readings[0], meta: { serverTime: new Date().toISOString(), lastSeenAt: readings[0].receivedAt, deviceOnline: true, ageMs: 500, stale: false, connectionState: 'connected_with_recent_reading' } });
    }
    if (path.endsWith('/measurements')) {
      const body = overrides.measurements ? overrides.measurements(url) : { data: readings.slice(0, 20), pagination: { nextCursor: null, hasMore: false } };
      return json(body);
    }
    if (path.includes('/sessions')) return json({ data: overrides.sessions?.() ?? [activeSession], pagination: { nextCursor: null, hasMore: false } });
    if (path.endsWith(`/patients/${patientId}`)) return json({ data: { id: patientId, code: 'P-1', displayName: 'Paciente de prueba', enabled: true, createdAt: '2026-10-19T09:00:00.000Z', updatedAt: '2026-10-19T09:00:00.000Z' } });
    return json({ error: { code: 'NOT_FOUND', message: 'No encontrado' } }, 404);
  }) as typeof fetch;
  return calls;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/monitoring/${patientId}`]}>
        <Routes>
          <Route path="/monitoring/:patientId" element={<PatientMonitoringPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('pantalla de monitoreo con la capa de datos', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    globalThis.fetch = original;
    delete (document as unknown as { hidden?: boolean }).hidden;
  });

  it('descubre una sesión iniciada externamente y vuelve a esperar al finalizarla', async () => {
    // Solo el intervalo es controlado; React Query y waitFor conservan sus
    // notificaciones reales. Evita depender de la carga del runner de Windows.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let sessions: unknown[] = [];
    const calls = installFetch({ sessions: () => sessions });
    renderPage();
    await screen.findByText('Sin sesión activa · consulta histórica');
    await screen.findByText(/20 lecturas cargadas/);
    const count = (path: string) => calls.filter(call => call.includes(path)).length;
    const idleLatest = count('/latest');
    const idleHistory = count('/measurements');
    // Cambia solo el servidor: sin botones, invalidaciones ni eventos de foco.
    sessions = [activeSession];
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await screen.findByText('Monitoreo activo', {}, { timeout: 6500 });
    expect(count('/measurements')).toBe(idleHistory);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await waitFor(() => expect(count('/latest')).toBeGreaterThan(idleLatest), { timeout: 3500 });
    sessions = [];
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await screen.findByText('Sin sesión activa · consulta histórica', {}, { timeout: 3500 });
    const endedLatest = count('/latest');
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(count('/latest')).toBe(endedLatest);
    expect(count('/measurements')).toBe(idleHistory);
    expect(count('/access')).toBe(1);
    // La segunda sesión también debe descubrirse después de terminar la primera.
    sessions = [{ ...activeSession, id: 'session-2' }];
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await screen.findByText('Monitoreo activo', {}, { timeout: 6500 });
  }, 25000);

  it('pausa el descubrimiento en una pestaña oculta y lo reanuda al volver', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let sessions: unknown[] = [];
    const calls = installFetch({ sessions: () => sessions });
    renderPage();
    await screen.findByText('Sin sesión activa · consulta histórica');
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const sessionCalls = calls.filter(call => call.includes('/sessions')).length;
    sessions = [activeSession];
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });
    expect(calls.filter(call => call.includes('/sessions'))).toHaveLength(sessionCalls);
    expect(screen.queryByText('Monitoreo activo')).toBeNull();
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await screen.findByText('Monitoreo activo', {}, { timeout: 6500 });
  }, 15000);

  it('muestra la última muestra y el historial sin pedir el expediente completo', async () => {
    const calls = installFetch();
    renderPage();
    await waitFor(() => expect(screen.getByText('Paciente de prueba')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/20 lecturas cargadas/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Conectado con lectura reciente/)).toBeTruthy());
    // Una sola consulta inicial; los refrescos posteriores piden solo 20.
    const measurementCalls = calls.filter((call) => call.includes('/measurements'));
    expect(measurementCalls.length).toBeGreaterThan(0);
    expect(measurementCalls.some((call) => call.includes('limit=20'))).toBe(false);
    expect(measurementCalls.some((call) => call.includes('limit=100'))).toBe(true);
  }, 20000);

  it('acumula páginas antiguas al pedir más historial y declara la cobertura', async () => {
    const calls = installFetch({
      measurements: (url) => {
        const cursor = url.searchParams.get('cursor');
        const limit = Number(url.searchParams.get('limit') ?? 20);
        const start = cursor ? 100 : 0;
        const page = readings.slice(start, start + limit);
        const hasMore = start + limit < readings.length;
        return { data: page, pagination: { nextCursor: hasMore ? 'cursor-2' : null, hasMore } };
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/100 lecturas cargadas en 1 página/)).toBeTruthy(), { timeout: 10000 });
    const button = await screen.findByRole('button', { name: 'Cargar más antiguas' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    (button as HTMLButtonElement).click();
    await waitFor(() => expect(screen.getByText(/120 lecturas cargadas en 2 páginas/)).toBeTruthy(), { timeout: 10000 });
    expect(screen.getByText(/Alcanzaste el inicio del intervalo consultado/)).toBeTruthy();
    expect(calls.some((call) => call.includes('cursor=cursor-2'))).toBe(true);
  }, 20000);

  it('reintenta el archivo que falló y recupera historial después de un error de red', async () => {
    let offline = true;
    const calls = installFetch({ measurements: (url) => {
      if (offline && url.searchParams.get('limit') === '100') throw new TypeError('Network failure in test');
      return { data: readings.slice(0, 20), pagination: { nextCursor: null, hasMore: false } };
    } });
    renderPage();
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    offline = false;
    (retry as HTMLButtonElement).click();
    await waitFor(() => expect(screen.getByText(/20 lecturas cargadas en 1 página/)).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(calls.filter(call => call.includes('limit=100'))).toHaveLength(2);
  }, 20000);

  it('refrescar un historial sano solo vuelve a pedir la ventana reciente', async () => {
    const calls = installFetch();
    renderPage();
    await screen.findByText(/20 lecturas cargadas/);
    const archivesBefore = calls.filter(call => call.includes('limit=100')).length;
    const liveBefore = calls.filter(call => call.includes('limit=20')).length;
    (screen.getByRole('button', { name: 'Refrescar lecturas recientes' }) as HTMLButtonElement).click();
    await waitFor(() => expect(calls.filter(call => call.includes('limit=20')).length).toBeGreaterThan(liveBefore));
    expect(calls.filter(call => call.includes('limit=100'))).toHaveLength(archivesBefore);
  }, 20000);

  it('conserva las filas y reintenta el cursor de una página posterior fallida', async () => {
    let offline = true;
    const calls = installFetch({ measurements: url => {
      const cursor = url.searchParams.get('cursor');
      if (cursor && offline) throw new TypeError('Offline next page');
      const limit = Number(url.searchParams.get('limit'));
      const start = cursor ? 100 : 0;
      return { data: readings.slice(start, start + limit), pagination: { hasMore: !cursor, nextCursor: cursor ? null : 'cursor-2' } };
    } });
    renderPage();
    await screen.findByText(/100 lecturas cargadas/);
    (screen.getByRole('button', { name: 'Cargar más antiguas' }) as HTMLButtonElement).click();
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.getByText(/100 lecturas cargadas/)).toBeTruthy();
    const firstPages = calls.filter(c => c.includes('limit=100') && !c.includes('cursor=')).length;
    offline = false; (retry as HTMLButtonElement).click();
    await screen.findByText(/120 lecturas cargadas en 2 páginas/);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(calls.filter(c => c.includes('limit=100') && !c.includes('cursor='))).toHaveLength(firstPages);
    expect(calls.filter(c => c.includes('cursor=cursor-2'))).toHaveLength(2);
  }, 20000);
});
