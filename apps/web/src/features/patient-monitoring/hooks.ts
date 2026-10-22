import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LIVE_WINDOW_SIZE,
  fetchPatientLatest,
  fetchPatientMeasurements,
  recordPatientAccess,
  type HistoryRange,
} from './api';
import { coverageOf, olderHistoryWindow, recentHistoryWindow, windowReadings, type HistoryCoverage, type HistoryWindow } from './history';
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
  /** Refresca la ventana en vivo; recupera también el archivo si su consulta falló. */
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
  const client = useQueryClient();
  const visible = useDocumentVisible();
  // Una única fuente acotada. El sufijo evita reutilizar la forma antigua de
  // useInfiniteQuery al actualizar la aplicación con una caché existente.
  const queryKey = useMemo(() => [...monitoringKeys.historyArchive(patientId, range), 'window-v2'],
    [patientId, range.from, range.to]);
  const navigation = useMemo<{ controller?: AbortController }>(() => ({}), [queryKey]);
  useEffect(() => () => navigation.controller?.abort(), [navigation]);
  const older = useMutation({
    mutationKey: queryKey,
    gcTime: 0,
    mutationFn: async () => {
      const controller = new AbortController();
      navigation.controller = controller;
      // Una navegación antigua no compite con una recuperación en vivo.
      await client.cancelQueries({ queryKey, exact: true });
      controller.signal.throwIfAborted();
      const previous = client.getQueryData<HistoryWindow>(queryKey);
      if (!previous) throw new Error('Primero debe cargar el historial.');
      const next = await olderHistoryWindow(previous, (cursor, limit) =>
        fetchPatientMeasurements(patientId, { ...range, cursor, limit }, controller.signal));
      controller.signal.throwIfAborted();
      if (!client.getQueryState(queryKey)) return; // logout limpió la caché
      client.setQueryData(queryKey, next);
    },
  });
  const archive = useQuery({
    queryKey,
    enabled,
    queryFn: ({ signal }) => recentHistoryWindow(client.getQueryData<HistoryWindow>(queryKey),
      (cursor, limit) => fetchPatientMeasurements(patientId, { ...range, cursor, limit }, signal)),
    refetchInterval: () => visible && options.poll && !older.isPending && !older.isError
      ? HISTORY_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const wasVisible = useRef(visible);
  useEffect(() => {
    // Se recupera el intervalo perdido al volver de una pestaña oculta, aunque
    // el temporizador de polling todavía no haya llegado a su siguiente tick.
    const resumed = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (enabled && resumed && options.poll && !older.isPending && !older.isError) {
      void client.refetchQueries({ queryKey, exact: true, type: 'active' });
    }
  }, [enabled, visible, options.poll, client, queryKey]);
  const readings = useMemo(() => archive.data ? windowReadings(archive.data) : [], [archive.data]);
  const hasMore = Boolean(archive.data?.nextCursor);
  const coverage = useMemo(() => coverageOf(readings, {
    hasMore, pagesLoaded: archive.data?.pages.length ?? 0,
  }), [readings, hasMore, archive.data]);
  const series = useMemo(() => buildSeries(readings), [readings]);

  const loadMore = useCallback(() => {
    if (hasMore && !archive.isFetching && !older.isPending) older.mutate();
  }, [hasMore, archive.isFetching, older]);
  const refresh = useCallback(() => {
    if (archive.isFetching || older.isPending) return;
    if (older.isError) older.mutate();
    else void archive.refetch();
  }, [archive, older]);

  return {
    readings,
    coverage,
    series,
    hasMore,
    loadMore,
    refresh,
    isPending: archive.isPending,
    isFetching: archive.isFetching || older.isPending,
    isError: archive.isError || older.isError,
    error: archive.error ?? older.error,
  };
}
