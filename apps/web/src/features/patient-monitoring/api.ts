import { apiClient, apiList, type ApiListResponse } from '../../lib/api-client';
import type { Patient, PatientMeasurement, PatientMonitoringMeta, PatientSession } from './patient-monitoring.types';

/**
 * Accesos HTTP del módulo de monitoreo (contrato B 2.0.0).
 *
 * Quien integra el dashboard no necesita conocer Firestore ni el detalle de las
 * rutas: consume estas funciones y los hooks de `hooks.ts`.
 */

/** Tamaño de página del historial acumulado. */
export const HISTORY_PAGE_SIZE = 100;

/** Tamaño de la ventana en vivo; es lo único que se refresca periódicamente. */
export const LIVE_WINDOW_SIZE = 20;

export interface HistoryRange {
  /** Límite inferior inclusivo (ISO UTC). */
  from?: string;
  /** Límite superior exclusivo (ISO UTC). */
  to?: string;
}

export interface MeasurementPageQuery extends HistoryRange {
  cursor?: string;
  limit?: number;
}

export function patientEndpoint(patientId: string, suffix = ''): string {
  return `/patients/${encodeURIComponent(patientId)}${suffix}`;
}

/** Última muestra de la asignación y placa activas del paciente. */
export async function fetchPatientLatest(
  patientId: string,
  signal?: AbortSignal
): Promise<{ data: PatientMeasurement | null; meta: PatientMonitoringMeta }> {
  const response = await apiClient<PatientMeasurement | null>(patientEndpoint(patientId, '/latest'), { signal });
  return { data: response.data, meta: response.meta as unknown as PatientMonitoringMeta };
}

/** Identidad seudónima del paciente. */
export async function fetchPatient(patientId: string, signal?: AbortSignal): Promise<Patient> {
  const response = await apiClient<Patient>(patientEndpoint(patientId), { signal });
  return response.data;
}

/** Sesión activa del paciente, si existe. */
export async function fetchActiveSession(patientId: string, signal?: AbortSignal): Promise<PatientSession | null> {
  const response = await apiList<PatientSession>('/sessions', { signal, params: { patientId, status: 'active', limit: 1 } });
  return response.data[0] ?? null;
}

/**
 * Página del historial del paciente. El cursor es opaco y está ligado a los
 * filtros y al orden: cambiar de paciente o de rango invalida el recorrido.
 */
export async function fetchPatientMeasurements(
  patientId: string,
  query: MeasurementPageQuery = {},
  signal?: AbortSignal
): Promise<ApiListResponse<PatientMeasurement>> {
  return apiList<PatientMeasurement>(patientEndpoint(patientId, '/measurements'), {
    signal,
    params: { from: query.from, to: query.to, cursor: query.cursor, limit: query.limit ?? HISTORY_PAGE_SIZE },
  });
}

/** Registra la apertura del expediente. Es idempotente por `viewId`. */
export async function recordPatientAccess(
  patientId: string,
  viewId: string
): Promise<{ eventId: string; duplicate: boolean }> {
  const response = await apiClient<{ eventId: string; duplicate: boolean }>(patientEndpoint(patientId, '/access'), {
    method: 'POST',
    json: { viewId },
  });
  return response.data;
}
