import type { PatientMeasurement } from './patient-monitoring.types';

/**
 * Capa de historial del paciente (contrato B §7, `/patients/{id}/measurements`).
 *
 * El servidor ordena por `receivedAt DESC` y desempata por la ruta completa del
 * documento (`sessions/{sessionId}/measurements/{id}`). Este módulo reproduce ese
 * orden para poder acumular páginas sin duplicar ni perder muestras cuando dos
 * lecturas comparten el mismo milisegundo.
 */

/** Identidad completa de una lectura: el ID de medición solo es único dentro de su sesión. */
export function measurementKey(measurement: PatientMeasurement): string {
  return `${measurement.sessionId}/${measurement.id}`;
}

/** Ruta del documento en Firestore; el servidor desempata por ella. */
export function measurementPath(measurement: PatientMeasurement): string {
  return `sessions/${measurement.sessionId}/measurements/${measurement.id}`;
}

/** Comparación por bytes, equivalente al orden de Firestore para identificadores ASCII. */
export function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Orden del servidor: `receivedAt DESC` y, en empate temporal, ruta completa DESC. */
export function compareServerOrder(a: PatientMeasurement, b: PatientMeasurement): number {
  const at = Date.parse(a.receivedAt);
  const bt = Date.parse(b.receivedAt);
  if (at !== bt) return bt - at;
  return comparePaths(measurementPath(b), measurementPath(a));
}

/** Conserva la primera aparición de cada lectura y descarta duplicados. */
export function uniqueReadings(readings: readonly PatientMeasurement[]): PatientMeasurement[] {
  const unique = new Map<string, PatientMeasurement>();
  for (const reading of readings) {
    const key = measurementKey(reading);
    if (!unique.has(key)) unique.set(key, reading);
  }
  return [...unique.values()];
}

/**
 * Une varias páginas (ventana en vivo + páginas acumuladas) sin duplicar lecturas
 * y en el mismo orden que entrega el servidor (más reciente primero).
 */
export function mergeMeasurements(...groups: Array<readonly PatientMeasurement[]>): PatientMeasurement[] {
  return uniqueReadings(groups.flat()).sort(compareServerOrder);
}

export interface HistoryCoverage {
  /** Lecturas que la interfaz puede representar ahora. */
  loaded: number;
  /** Páginas de historial acumuladas por la persona usuaria. */
  pagesLoaded: number;
  /** Instante de la lectura más reciente cargada. */
  newestReceivedAt: string | null;
  /** Instante de la lectura más antigua cargada. */
  oldestReceivedAt: string | null;
  /** El servidor tiene más páginas para el intervalo consultado. */
  hasMore: boolean;
  /** Se alcanzó el inicio del intervalo consultado. */
  complete: boolean;
  /** Se descartaron lecturas por el límite de memoria; la cobertura se declara, no se oculta. */
  truncated: boolean;
  /** Lecturas descartadas por el límite de memoria. */
  dropped: number;
}

/** Límite de lecturas en memoria y en pantalla por expediente. */
export const MAX_HISTORY_SAMPLES = 1000;

export interface CoverageInput {
  hasMore: boolean;
  pagesLoaded: number;
  limit?: number;
}

/**
 * Declara la cobertura de lo cargado. Si se supera el límite se conservan las
 * lecturas más recientes y se informa cuántas se descartaron.
 */
export function coverageOf(readings: readonly PatientMeasurement[], input: CoverageInput): HistoryCoverage {
  const limit = input.limit ?? MAX_HISTORY_SAMPLES;
  const kept = readings.slice(0, limit);
  const dropped = readings.length - kept.length;
  const newest = kept[0]?.receivedAt ?? null;
  const oldest = kept.length > 0 ? kept[kept.length - 1].receivedAt : null;
  return {
    loaded: kept.length,
    pagesLoaded: input.pagesLoaded,
    newestReceivedAt: newest,
    oldestReceivedAt: oldest,
    hasMore: input.hasMore,
    complete: !input.hasMore,
    truncated: dropped > 0,
    dropped,
  };
}

/** Normaliza el rango temporal para usarlo como parte de la clave de consulta. */
export function rangeKey(range: { from?: string; to?: string }): string {
  return `${range.from ?? ''}|${range.to ?? ''}`;
}
