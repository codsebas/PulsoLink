import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchPatientLatest, fetchPatientMeasurements, HISTORY_PAGE_SIZE, LIVE_WINDOW_SIZE } from '../src/features/patient-monitoring/api';
import { coverageOf, mergeMeasurements } from '../src/features/patient-monitoring/history';
import type { PatientMeasurement } from '../src/features/patient-monitoring/patient-monitoring.types';

/**
 * Verificación contra la API real (emuladores + backend local).
 *
 * Se omite salvo que se providea un entorno con sesión iniciada:
 *   PULSOLINK_API_URL, PULSOLINK_SESSION_COOKIE y PULSOLINK_PATIENT_ID.
 * Reproduce el recorrido del frontend: páginas de 100 lecturas, deduplicación
 * y declaración de cobertura sobre el historial real del paciente.
 */
const enabled = Boolean(process.env.PULSOLINK_API_URL && process.env.PULSOLINK_SESSION_COOKIE && process.env.PULSOLINK_PATIENT_ID);

describe.skipIf(!enabled)('historial del paciente contra la API real', () => {
  const original = globalThis.fetch;
  beforeAll(() => {
    const base = process.env.PULSOLINK_API_URL!;
    const cookie = process.env.PULSOLINK_SESSION_COOKIE!;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
      const headers = new Headers(init?.headers);
      headers.set('cookie', cookie);
      return original(new URL(raw, base), { ...init, headers });
    }) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = original;
  });

  it('recorre todas las páginas sin duplicar ni perder lecturas', async () => {
    const patientId = process.env.PULSOLINK_PATIENT_ID!;
    const pages: PatientMeasurement[][] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await fetchPatientMeasurements(patientId, { cursor, limit: HISTORY_PAGE_SIZE });
      pages.push(page.data);
      if (!page.pagination.hasMore || !page.pagination.nextCursor) break;
      cursor = page.pagination.nextCursor;
    }
    const merged = mergeMeasurements(...pages);
    const keys = new Set(merged.map((row) => `${row.sessionId}/${row.id}`));
    expect(keys.size).toBe(merged.length);
    const times = merged.map((row) => Date.parse(row.receivedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // El orden del cliente (receivedAt DESC, ruta completa DESC) debe coincidir
    // con el del servidor; si difiere, el desempate por empates temporales falla.
    expect(merged.map((row) => `${row.sessionId}/${row.id}`)).toEqual(pages.flat().map((row) => `${row.sessionId}/${row.id}`));
    const coverage = coverageOf(merged, { hasMore: false, pagesLoaded: pages.length });
    expect(coverage.loaded).toBe(merged.length);
    expect(coverage.complete).toBe(true);
    console.log('páginas:', pages.length, 'lecturas:', merged.length, 'cobertura:', coverage);
  }, 30000);

  it('conserva la calidad de cada magnitud en la última muestra y en el historial', async () => {
    const patientId = process.env.PULSOLINK_PATIENT_ID!;
    const latest = await fetchPatientLatest(patientId);
    expect(latest.data).not.toBeNull();
    expect(['disconnected', 'connected_without_valid_reading', 'connected_with_recent_reading']).toContain(latest.meta.connectionState);
    const noContact = Object.values(latest.data!.measurements).filter((reading) => reading.status !== 'valid');
    for (const reading of noContact) expect(reading.value).toBeNull();
    const window = await fetchPatientMeasurements(patientId, { limit: LIVE_WINDOW_SIZE });
    expect(window.data.length).toBeLessThanOrEqual(LIVE_WINDOW_SIZE);
    expect(window.pagination.hasMore).toBe(true);
  }, 30000);
});
