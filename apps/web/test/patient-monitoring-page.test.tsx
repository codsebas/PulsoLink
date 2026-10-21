// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

function installFetch(overrides: { measurements?: (url: URL) => unknown } = {}) {
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
    if (path.includes('/sessions')) return json({ data: [{ id: 'session-1', patientId, deviceId: 'device-1', assignmentId: 'assignment-1', status: 'active' }], pagination: { nextCursor: null, hasMore: false } });
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
    globalThis.fetch = original;
  });

  it('muestra la última muestra y el historial sin pedir el expediente completo', async () => {
    const calls = installFetch();
    renderPage();
    await waitFor(() => expect(screen.getByText('Paciente de prueba')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/20 lecturas cargadas/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Conectado con lectura reciente/)).toBeTruthy());
    // La ventana en vivo pide 20 lecturas; el archivo acumulado pide 100.
    const measurementCalls = calls.filter((call) => call.includes('/measurements'));
    expect(measurementCalls.length).toBeGreaterThan(0);
    expect(measurementCalls.some((call) => call.includes('limit=20'))).toBe(true);
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
    await waitFor(() => expect(screen.getByText(/100 lecturas cargadas en 1 página/)).toBeTruthy());
    const button = await screen.findByRole('button', { name: 'Cargar más antiguas' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    (button as HTMLButtonElement).click();
    await waitFor(() => expect(screen.getByText(/120 lecturas cargadas en 2 páginas/)).toBeTruthy());
    expect(screen.getByText(/Alcanzaste el inicio del intervalo consultado/)).toBeTruthy();
    expect(calls.some((call) => call.includes('cursor=cursor-2'))).toBe(true);
  }, 20000);
});
