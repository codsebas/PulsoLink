import type { PatientMeasurement } from './patient-monitoring.types';

export const GAP_AFTER_MS = 10000;
export interface TrendPoint { at: number; heartRate: number | null; spo2: number | null; skinTemperature: number | null }

// A full historical identity is session + reading ID. Two sessions can have
// the same reading ID; deduplicating by id alone would silently lose history.
export function trendPoints(readings: PatientMeasurement[]): TrendPoint[] {
  const unique = new Map(readings.map((row) => [`${row.sessionId}/${row.id}`, row]));
  const sorted = [...unique.values()].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt) ||
    `${a.sessionId}/${a.id}`.localeCompare(`${b.sessionId}/${b.id}`));
  const points: TrendPoint[] = [];
  let previous: PatientMeasurement | undefined;
  for (const row of sorted) {
    const at = Date.parse(row.receivedAt);
    if (previous && (at - Date.parse(previous.receivedAt) > GAP_AFTER_MS || previous.sessionId !== row.sessionId || previous.assignmentId !== row.assignmentId || previous.deviceId !== row.deviceId)) {
      points.push({ at: (at + Date.parse(previous.receivedAt)) / 2, heartRate: null, spo2: null, skinTemperature: null });
    }
    const value = (key: keyof PatientMeasurement['measurements']) => row.measurements[key].status === 'valid' ? row.measurements[key].value : null;
    points.push({ at, heartRate: value('heartRate'), spo2: value('spo2'), skinTemperature: value('skinTemperature') });
    previous = row;
  }
  return points;
}

export function guatemalaDate(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 'Sin datos';
  return new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
}
export function formatVital(value: number | null): string {
  return value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1);
}
export function rangeFromLocal(from: string, to: string) {
  const convert = (value: string) => value ? new Date(`${value}-06:00`).toISOString() : undefined;
  const result = { from: convert(from), to: convert(to) };
  if (result.from && result.to && result.from >= result.to) throw new Error('El inicio debe ser anterior al final.');
  return result;
}
