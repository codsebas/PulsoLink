import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ApiListResponse } from '../../lib/api-client';
import {
  HISTORY_PAGE_SIZE,
  LIVE_WINDOW_SIZE,
  fetchPatientLatest,
  fetchPatientMeasurements,
  recordPatientAccess,
  type HistoryRange,
} from './api';
import { MAX_HISTORY_SAMPLES, coverageOf, mergeMeasurements, type HistoryCoverage } from './history';
import { monitoringKeys } from './keys';
import { buildSeries, type MagnitudeSeries } from './series';
import type { PatientMeasurement } from './patient-monitoring.types';

/**
 * Hooks del módulo de monitoreo (contrato B 2.0.0).
 *
 * Reglas de coordinación:
 * - El polling solo ocurre con una sesión activa y la pestaña visible.
 * - El refresco periódico descarga únicamente la ventana en vivo; las páginas
 *   acumuladas del historial no se vuelven a bajar en cada tick.
 * - Cada clave de consulta incluye el paciente y el rango, de modo que cambiar
 *   de paciente o de intervalo nunca mezcla ni conserva datos del anterior.
 */

/** Intervalo de refresco de la última muestra. */
export const LATEST_POLL_MS = 2000;

/** Intervalo de refresco de la ventana en vivo del historial. */
export const HISTORY_POLL_MS = 10000;

export interface PollingPlan {
  /** Periodicidad de la última muestra; `false` desactiva el refresco. */
  latest: number | false;
  /** Periodicidad de la ventana en vivo del historial. */
  history: number | false;
}

/**
 * Decide qué se refresca solo. El historial acumulado nunca entra en el plan:
 * sus páginas se piden a demanda y no se vuelven a bajar en cada tick.
 */
export function pollingPlan(input: { visible: boolean; sessionActive: boolean }): PollingPlan {
  const active = input.visible && input.sessionActive;
  return { latest: active ? LATEST_POLL_MS : false, history: active ? HISTORY_POLL_MS : false };
}

/** `true` cuando la pestaña del navegador está visible. */
export function useDocumentVisible(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof document === 'undefined') return () => undefined;
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  const getSnapshot = useCallback(() => (typeof document === 'undefined' ? true : !document.hidden), []);
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

/** Registro idempotente de la apertura del expediente. */
export function usePatientAccess(patientId: string, viewId: string, enabled = true) {
  return useQuery({
    queryKey: monitoringKeys.access(patientId, viewId),
    queryFn: () => recordPatientAccess(patientId, viewId),
    enabled: enabled && Boolean(patientId) && Boolean(viewId),
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Última muestra y estado de conexión de la placa activa. */
export function usePatientLatest(patientId: string, options: { enabled?: boolean; poll?: boolean } = {}) {
  const visible = useDocumentVisible();
  const polling = options.poll ?? false;
  return useQuery({
    queryKey: monitoringKeys.latest(patientId),
    queryFn: ({ signal }) => fetchPatientLatest(patientId, signal),
    enabled: (options.enabled ?? true) && Boolean(patientId),
    refetchInterval: visible && polling ? LATEST_POLL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 1000,
  });
}

/**
 * Ventana más reciente del historial. Es la única parte que se refresca sola,
 * para no descargar el expediente completo en cada tick.
 */
export function usePatientLiveWindow(
  patientId: string,
  range: HistoryRange,
  options: { enabled?: boolean; poll?: boolean } = {}
) {
  const visible = useDocumentVisible();
  const polling = options.poll ?? false;
  return useQuery({
    queryKey: monitoringKeys.historyLive(patientId, range),
    queryFn: ({ signal }) => fetchPatientMeasurements(patientId, { ...range, limit: LIVE_WINDOW_SIZE }, signal),
    enabled: (options.enabled ?? true) && Boolean(patientId),
    refetchInterval: visible && polling ? HISTORY_POLL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 1000,
  });
}

export interface PatientHistoryResult {
  /** Lecturas del historial en orden del servidor (más reciente primero). */
  readings: PatientMeasurement[];
  /** Cobertura declarada de lo cargado. */
  coverage: HistoryCoverage;
  /** Series cronológicas por magnitud, con huecos y nulos conservados. */
  series: MagnitudeSeries;
  /** El servidor tiene páginas adicionales para el intervalo consultado. */
  hasMore: boolean;
  /** Carga la página siguiente del historial. */
  loadMore: () => void;
  /** Refresca solo la ventana en vivo; no vuelve a bajar las páginas acumuladas. */
  refresh: () => void;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}

/**
 * Historial acumulado del paciente: ventana en vivo + páginas que la persona
 * usuaria carga a demanda, deduplicadas y limitadas en memoria.
 */
export function usePatientHistory(
  patientId: string,
  range: HistoryRange,
  options: { enabled?: boolean; poll?: boolean } = {}
): PatientHistoryResult {
  const enabled = (options.enabled ?? true) && Boolean(patientId);
  const live = usePatientLiveWindow(patientId, range, { enabled, poll: options.poll });
  const archive = useInfiniteQuery<ApiListResponse<PatientMeasurement>>({
    queryKey: monitoringKeys.historyArchive(patientId, range),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchPatientMeasurements(patientId, { ...range, cursor: pageParam as string | undefined, limit: HISTORY_PAGE_SIZE }, signal),
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    staleTime: 5000,
  });

  const pages = archive.data?.pages ?? [];
  const merged = useMemo(
    () => mergeMeasurements(live.data?.data ?? [], ...pages.map((page) => page.data)),
    [live.data, pages]
  );
  // Límite de memoria y de render: se conservan las lecturas más recientes y la
  // cobertura declara cuántas se descartaron.
  const readings = useMemo(() => merged.slice(0, MAX_HISTORY_SAMPLES), [merged]);
  const coverage = useMemo(
    () =>
      coverageOf(merged, {
        hasMore: archive.hasNextPage,
        pagesLoaded: pages.length,
        limit: MAX_HISTORY_SAMPLES,
      }),
    [merged, archive.hasNextPage, pages.length]
  );
  const series = useMemo(() => buildSeries(readings), [readings]);

  const loadMore = useCallback(() => {
    if (archive.hasNextPage && !archive.isFetchingNextPage) void archive.fetchNextPage();
  }, [archive]);
  const refresh = useCallback(() => {
    void live.refetch();
  }, [live]);

  return {
    readings,
    coverage,
    series,
    hasMore: archive.hasNextPage,
    loadMore,
    refresh,
    isPending: live.isPending || archive.isPending,
    isFetching: live.isFetching || archive.isFetching,
    isError: live.isError || archive.isError,
    error: live.error ?? archive.error,
  };
}
