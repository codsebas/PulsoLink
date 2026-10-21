import { afterEach, describe, expect, it } from 'vitest';
import { fetchPatientMeasurements, HISTORY_PAGE_SIZE, LIVE_WINDOW_SIZE } from '../src/features/patient-monitoring/api';
import { mergeMeasurements, coverageOf } from '../src/features/patient-monitoring/history';
import type { PatientMeasurement } from '../src/features/patient-monitoring/patient-monitoring.types';
import { installHistoryFetch, reading } from './helpers';

const base = Date.parse('2026-10-19T10:00:00.000Z');

/** Dos placas, tres lecturas por segundo y empates temporales deliberados. */
function dataset(): PatientMeasurement[] {
  const rows: PatientMeasurement[] = [];
  const groups = 80;
  for (let group = 0; group < groups; group++) {
    const sessionId = group % 2 === 0 ? 'session-1' : 'session-2';
    const deviceId = group % 2 === 0 ? 'device-1' : 'device-2';
    const receivedAt = new Date(base - group * 1000).toISOString();
    for (let item = 0; item < 3; item++) {
      rows.push(reading({ id: `m${String(group * 3 + item).padStart(3, '0')}`, sessionId, deviceId, receivedAt }));
    }
  }
  return rows;
}

describe('acceso HTTP al historial del paciente', () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('recorre varias páginas sin duplicar ni perder lecturas con empates temporales', async () => {
    const rows = dataset();
    const installed = installHistoryFetch(rows);
    restore = installed.restore;

    const pages: PatientMeasurement[][] = [];
    let cursor: string | undefined;
    let guard = 0;
    for (;;) {
      const page = await fetchPatientMeasurements('patient-1', { cursor, limit: HISTORY_PAGE_SIZE });
      pages.push(page.data);
      if (!page.pagination.hasMore || !page.pagination.nextCursor) break;
      cursor = page.pagination.nextCursor;
      guard += 1;
      if (guard > 20) throw new Error('El recorrido no termina');
    }

    expect(pages.length).toBeGreaterThan(1);
    const merged = mergeMeasurements(...pages);
    expect(merged).toHaveLength(rows.length);
    expect(new Set(merged.map((row) => `${row.sessionId}/${row.id}`)).size).toBe(rows.length);
    // El orden final reproduce el del servidor: receivedAt DESC y ruta completa DESC.
    const times = merged.map((row) => Date.parse(row.receivedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const coverage = coverageOf(merged, { hasMore: false, pagesLoaded: pages.length });
    expect(coverage).toMatchObject({ loaded: rows.length, complete: true, truncated: false, dropped: 0 });
  });

  it('envía el cursor, el límite y los filtros temporales al servidor', async () => {
    const rows = dataset();
    const installed = installHistoryFetch(rows);
    restore = installed.restore;

    const page = await fetchPatientMeasurements('patient-1', { from: '2026-10-19T09:59:00.000Z', to: '2026-10-19T09:59:30.000Z', limit: 10 });
    expect(installed.calls[0]).toContain('/api/v1/patients/patient-1/measurements');
    expect(installed.calls[0]).toContain('from=2026-10-19T09%3A59%3A00.000Z');
    expect(installed.calls[0]).toContain('to=2026-10-19T09%3A59%3A30.000Z');
    expect(installed.calls[0]).toContain('limit=10');
    expect(page.data.length).toBeGreaterThan(0);
    expect(page.data.every((row) => row.receivedAt >= '2026-10-19T09:59:00.000Z' && row.receivedAt < '2026-10-19T09:59:30.000Z')).toBe(true);
    expect(installed.server.requests[0].cursor).toBeNull();
  });

  it('la ventana en vivo pide solo una fracción del historial', () => {
    expect(LIVE_WINDOW_SIZE).toBeLessThan(HISTORY_PAGE_SIZE);
  });
});
