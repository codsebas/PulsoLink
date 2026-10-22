// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePatientHistory } from '../src/features/patient-monitoring/hooks';
import type { PatientMeasurement } from '../src/features/patient-monitoring/patient-monitoring.types';
import { installHistoryFetch, reading } from './helpers';

/**
 * Aceptación de la capa de historial (criterios QA HIST-01 e HIST-02).
 *
 * Se ejercita el hook real contra el modelo de servidor del historial: la
 * ventana en vivo, la acumulación de páginas y la cobertura se comprueban tal
 * como los ve la persona usuaria en la pantalla de monitoreo.
 */

const base = Date.parse('2026-10-19T10:00:00.000Z');
const STEP_MS = 1000;

/** Lecturas consecutivas de un segundo: cualquier hueco del historial se nota. */
function series(count: number, tag = 'm'): PatientMeasurement[] {
  return Array.from({ length: count }, (_, index) =>
    reading({ id: `${tag}${String(index).padStart(4, '0')}`, sessionId: 'session-1', receivedAt: new Date(base - index * STEP_MS).toISOString() })
  );
}

/** Lecturas que llegan después de las existentes (pestaña oculta o reconexión). */
function newer(count: number, tag = 'n', offsetSeconds = 0): PatientMeasurement[] {
  return Array.from({ length: count }, (_, index) =>
    reading({ id: `${tag}${String(index).padStart(4, '0')}`, sessionId: 'session-1', receivedAt: new Date(base + (offsetSeconds + count - index) * STEP_MS).toISOString() })
  );
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

/** Instantes de las lecturas cargadas, del más reciente al más antiguo. */
function timeline(readings: readonly PatientMeasurement[]): number[] {
  return readings.map((row) => Date.parse(row.receivedAt)).sort((a, b) => b - a);
}

/** No debe haber saltos: cada lectura consecutive está a un segundo de la anterior. */
function expectNoHoles(readings: readonly PatientMeasurement[]): void {
  const times = timeline(readings);
  for (let index = 1; index < times.length; index += 1) {
    expect(times[index - 1] - times[index]).toBe(STEP_MS);
  }
}

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('aceptación del historial del paciente', () => {
  it('HIST-01: no pierde lecturas cuando entran más lecturas que la ventana en vivo', async () => {
    const installed = installHistoryFetch(series(162));
    restore = installed.restore;

    const { result } = renderHook(() => usePatientHistory('patient-1', {}, { enabled: true, poll: false }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.readings.length).toBe(100));
    const initialCalls = installed.calls.length;

    // La pestaña estuvo oculta: llegaron 30 lecturas y la ventana en vivo solo trae 20.
    installed.add(newer(30));
    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.readings.length).toBe(130));
    expectNoHoles(result.current.readings);
    expect(timeline(result.current.readings)[0]).toBe(base + 30 * STEP_MS);
    // La ventana en vivo (una página) más el tramo rellenado: el archivo no se vuelve a bajar.
    expect(installed.calls.length - initialCalls).toBe(2);

    // Un refresco normal (pocas lecturas nuevas) no necesita tramo de relleno.
    installed.add(newer(5, 'p', 30));
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.readings.length).toBe(135));
    expectNoHoles(result.current.readings);
    expect(installed.calls.length - initialCalls).toBe(3);
  });

  it('HIST-02: pagina hasta el inicio real del expediente sin esconder lo recién cargado', async () => {
    const installed = installHistoryFetch(series(1120));
    restore = installed.restore;

    const { result } = renderHook(() => usePatientHistory('patient-1', {}, { enabled: true, poll: false }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.readings.length).toBe(100));

    let guard = 0;
    while (result.current.hasMore && guard < 20) {
      const before = result.current.readings.length;
      await act(async () => {
        result.current.loadMore();
      });
      await waitFor(() => expect(result.current.readings.length).toBeGreaterThan(before));
      guard += 1;
    }

    expect(result.current.hasMore).toBe(false);
    expect(result.current.readings.length).toBe(1120);
    expectNoHoles(result.current.readings);
    expect(result.current.coverage).toMatchObject({ loaded: 1120, pagesLoaded: 12, hasMore: false, complete: true, truncated: false, dropped: 0 });
    expect(result.current.coverage.oldestReceivedAt).toBe(new Date(base - 1119 * STEP_MS).toISOString());
  });
});
