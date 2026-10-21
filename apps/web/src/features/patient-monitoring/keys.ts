import { rangeKey } from './history';

/**
 * Claves de consulta del módulo de monitoreo.
 *
 * Toda clave incluye el paciente y el rango consultado: cambiar de paciente o
 * de intervalo produce una entrada de caché distinta, de modo que nunca se
 * mezclan ni se conservan valores del expediente anterior.
 */
export const monitoringKeys = {
  latest: (patientId: string) => ['patient', patientId, 'latest'] as const,
  historyLive: (patientId: string, range: { from?: string; to?: string }) =>
    ['patient', patientId, 'history', rangeKey(range), 'live'] as const,
  historyArchive: (patientId: string, range: { from?: string; to?: string }) =>
    ['patient', patientId, 'history', rangeKey(range), 'archive'] as const,
  access: (patientId: string, viewId: string) => ['patient-access', patientId, viewId] as const,
};
