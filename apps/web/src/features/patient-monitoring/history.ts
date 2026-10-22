import type { PatientMeasurement } from './patient-monitoring.types';
import type { ApiListResponse } from '../../lib/api-client';

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

/**
 * Límite de lecturas que se conservan en la parte automática de la ventana (la
 * que crece sola con el refresco en vivo).
 *
 * Lo que la persona usuaria abre con «Cargar más antiguas» no se recorta: el
 * archivo del paciente se recorre hasta el inicio real del expediente y las
 * páginas recién descargadas no se esconden (criterio de QA HIST-02).
 */
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
  const limit = input.limit ?? readings.length;
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

type HistoryPage = ApiListResponse<PatientMeasurement>;
export interface HistoryWindow {
  /** Páginas retenidas, de la más reciente a la más antigua. */
  pages: HistoryPage[];
  /** Cursor de la página siguiente más antigua del expediente. */
  nextCursor: string | null;
  /**
   * Índice de la primera página que la persona usuaria abrió con «Cargar más
   * antiguas». Desde ese índice, las páginas son suyas: no se descartan.
   */
  visitedFrom: number;
}

// También acota páginas superpuestas cuando llegan pocas muestras por refresco.
export const MAX_HISTORY_PAGES = 50;
type FetchHistoryPage = (cursor: string | undefined, limit: number) => Promise<HistoryPage>;

function readingsOf(pages: readonly HistoryPage[]): PatientMeasurement[] {
  return mergeMeasurements(...pages.map(page => page.data));
}

export function windowReadings(window: HistoryWindow): PatientMeasurement[] {
  return readingsOf(window.pages);
}

/**
 * Acota la parte automática de la ventana, la única que crece sola.
 *
 * Con navegación activa no se recorta nada: la ventana es un tramo continuo del
 * expediente y descartar por un lado abriría un hueco o escondería las páginas
 * que la persona usuaria acababa de descargar.
 */
function boundedWindow(pages: HistoryPage[], visitedFrom: number, nextCursor: string | null): HistoryWindow {
  const retained = [...pages];
  const visited = Math.min(visitedFrom, retained.length);
  if (visited < retained.length) return { pages: retained, visitedFrom: visited, nextCursor };
  while (retained.length > 1 && (retained.length > MAX_HISTORY_PAGES ||
    readingsOf(retained).length > MAX_HISTORY_SAMPLES)) {
    retained.pop();
    nextCursor = retained[retained.length - 1].pagination.nextCursor;
  }
  return { pages: retained, visitedFrom: retained.length, nextCursor };
}

/**
 * Compacta la parte automática en una sola página sintética. Evita que el
 * refresco periódico guarde páginas repetidas: se conservan las lecturas
 * distintas del tramo y la página más antigua, que es la que aporta el cursor
 * con el que sigue la navegación.
 *
 * Solo se compacta cuando la persona usuaria ya navigó hacia atrás: sin
 * navegación, conservar las páginas permite que el recorte por memoria siga
 * actuando sobre el tramo automático.
 */
function compactRecent(pages: HistoryPage[], visitedFrom: number): { pages: HistoryPage[]; visitedFrom: number } {
  if (visitedFrom >= pages.length) return { pages, visitedFrom };
  const automatic = pages.slice(0, visitedFrom);
  const last = automatic[automatic.length - 1];
  const head = automatic.slice(0, -1);
  if (head.length === 0) return { pages, visitedFrom };
  const compact: HistoryPage = {
    data: readingsOf(head),
    pagination: { nextCursor: last.pagination.nextCursor, hasMore: last.pagination.hasMore },
  };
  return { pages: [compact, last, ...pages.slice(visitedFrom)], visitedFrom: 2 };
}

/** Cursores originales, sin reconstruirlos a partir de una fecha ni cortar páginas. */
export async function olderHistoryWindow(previous: HistoryWindow, fetchPage: FetchHistoryPage): Promise<HistoryWindow> {
  if (!previous.nextCursor) return previous;
  const page = await fetchPage(previous.nextCursor, 100);
  // La navegación conserva todo lo cargado: la página recién descargada y las
  // anteriores siguen visibles hasta el inicio real del expediente.
  const visitedFrom = previous.visitedFrom < previous.pages.length ? previous.visitedFrom : previous.pages.length;
  return { pages: [...previous.pages, page], visitedFrom, nextCursor: page.pagination.nextCursor };
}

/** Recupera solo el tramo nuevo hasta solapar la frontera ya cargada. */
export async function recentHistoryWindow(previous: HistoryWindow | undefined, fetchPage: FetchHistoryPage): Promise<HistoryWindow> {
  if (!previous || windowReadings(previous).length === 0) {
    const first = await fetchPage(undefined, 100);
    return { pages: [first], visitedFrom: 1, nextCursor: first.pagination.nextCursor };
  }
  const frontier = measurementKey(windowReadings(previous)[0]);
  const pages = [await fetchPage(undefined, 20)];
  const overlaps = () => pages.some(page => page.data.some(row => measurementKey(row) === frontier));
  const seenCursors = new Set<string>();
  while (!overlaps() && pages[pages.length - 1].pagination.nextCursor &&
    mergeMeasurements(...pages.map(page => page.data)).length < MAX_HISTORY_SAMPLES) {
    const cursor = pages[pages.length - 1].pagination.nextCursor!;
    if (seenCursors.has(cursor)) throw new Error('El historial repitió un cursor sin avanzar.');
    seenCursors.add(cursor);
    pages.push(await fetchPage(cursor, 100));
  }
  if (!overlaps()) {
    // Una ausencia larga puede exceder la ventana. El cursor conserva acceso a
    // TODO lo anterior; no unimos extremos separados fingiendo continuidad. Las
    // páginas que la persona usuaria ya abrió se conservan: el hueco se ve en
    // las series, no se oculta.
    const visited = previous.pages.slice(previous.visitedFrom);
    const merged = [...pages, ...visited];
    const nextCursor = pages[pages.length - 1].pagination.nextCursor;
    if (visited.length === 0) return boundedWindow(merged, merged.length, nextCursor);
    return { pages: merged, visitedFrom: pages.length, nextCursor };
  }
  // No añadir páginas de polling que solo repiten datos ya retenidos.
  const known = new Set(windowReadings(previous).map(measurementKey));
  const additions = pages.filter(page => page.data.some(row => !known.has(measurementKey(row))));
  // La parte automática se recompone; las páginas visitadas no se tocan.
  const compacted = compactRecent([...additions, ...previous.pages], previous.visitedFrom + additions.length);
  return boundedWindow(compacted.pages, compacted.visitedFrom, previous.nextCursor);
}
