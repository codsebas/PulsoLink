import type { PatientMeasurement } from '../src/features/patient-monitoring/patient-monitoring.types';

export type VitalStatus = 'valid' | 'no_contact' | 'invalid' | 'unavailable';

export interface ReadingOptions {
  id: string;
  sessionId?: string;
  deviceId?: string;
  assignmentId?: string;
  receivedAt: string;
  heartRate?: { value: number | null; status?: VitalStatus };
  spo2?: { value: number | null; status?: VitalStatus };
  skinTemperature?: { value: number | null; status?: VitalStatus };
  patientId?: string;
  source?: 'real' | 'simulated';
}

export function reading(options: ReadingOptions): PatientMeasurement {
  const sessionId = options.sessionId ?? 'session-1';
  const vital = (value: number | null, status: VitalStatus, unit: 'bpm' | '%' | 'C') => ({ value, unit, status });
  return {
    id: options.id,
    sessionId,
    patientId: options.patientId ?? 'patient-1',
    assignmentId: options.assignmentId ?? `assignment-${sessionId}`,
    deviceId: options.deviceId ?? `device-${sessionId}`,
    source: options.source ?? 'simulated',
    bootId: 'boot-1',
    sequence: 0,
    capturedAt: null,
    receivedAt: options.receivedAt,
    measurements: {
      heartRate: vital(options.heartRate?.value ?? 78, options.heartRate?.status ?? 'valid', 'bpm'),
      spo2: vital(options.spo2?.value ?? 97, options.spo2?.status ?? 'valid', '%'),
      skinTemperature: vital(options.skinTemperature?.value ?? 33.2, options.skinTemperature?.status ?? 'valid', 'C'),
    },
  };
}

export function pathOf(measurement: PatientMeasurement): string {
  return `sessions/${measurement.sessionId}/measurements/${measurement.id}`;
}

/** Orden del servidor: `receivedAt DESC` y, en empate, ruta completa DESC. */
export function serverOrder(a: PatientMeasurement, b: PatientMeasurement): number {
  const at = Date.parse(a.receivedAt);
  const bt = Date.parse(b.receivedAt);
  if (at !== bt) return bt - at;
  return pathOf(b) < pathOf(a) ? -1 : pathOf(b) > pathOf(a) ? 1 : 0;
}

export interface ServerRequest {
  url: URL;
  limit: number;
  from: string | null;
  to: string | null;
  cursor: string | null;
}

/**
 * Modelo de servidor del historial: mismo orden, mismo cursor opaco y los mismos
 * filtros que el backend (from inclusivo, to exclusivo). Permite verificar la
 * paginación del cliente sin depender de Firestore.
 */
export function createHistoryServer(dataset: PatientMeasurement[]) {
  const rows = [...dataset];
  const requests: ServerRequest[] = [];
  return {
    requests,
    /** Agrega lecturas que llegan durante la sesión (pestaña oculta, reconexión). */
    add(readings: PatientMeasurement[]) {
      rows.push(...readings);
    },
    handle(url: URL) {
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const cursor = url.searchParams.get('cursor');
      requests.push({ url, limit, from, to, cursor });
      const filtered = [...rows].sort(serverOrder).filter(
        (row) => (!from || row.receivedAt >= from) && (!to || row.receivedAt < to)
      );
      let start = 0;
      if (cursor) {
        const decoded = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))) as { date: string; path: string };
        const position = filtered.findIndex((row) => row.receivedAt === decoded.date && pathOf(row) === decoded.path);
        start = position < 0 ? filtered.length : position + 1;
      }
      const page = filtered.slice(start, start + limit);
      const hasMore = start + limit < filtered.length;
      const last = page[page.length - 1];
      const nextCursor =
        hasMore && last
          ? btoa(JSON.stringify({ date: last.receivedAt, path: pathOf(last) })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          : null;
      return {
        status: 200,
        body: { data: page, pagination: { nextCursor, hasMore } },
      };
    },
  };
}

/** Instala un `fetch` simulado que responde con el modelo de servidor del historial. */
export function installHistoryFetch(dataset: PatientMeasurement[]) {
  const server = createHistoryServer(dataset);
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    calls.push(raw);
    const url = new URL(raw, 'http://localhost:3001');
    const result = server.handle(url);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return {
    server,
    calls,
    /** Agrega lecturas al servidor simulado sin reinstalar el `fetch`. */
    add(readings: PatientMeasurement[]) {
      server.add(readings);
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}
