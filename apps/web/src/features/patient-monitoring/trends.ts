import { rangeKey } from './history';

export { GAP_AFTER_MS, buildSeries, chronological, trendPoints } from './series';
export type { Magnitude, MagnitudeSeries, SeriesPoint, TrendPoint } from './series';

/** Formateo y filtros temporales compartidos por la pantalla de monitoreo. */
export function guatemalaDate(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 'Sin datos';
  return new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
}
export function formatVital(value: number | null): string {
  return value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1);
}
/** Convierte la hora local de Guatemala (UTC−6) a ISO UTC; `from` inclusivo y `to` exclusivo. */
export function rangeFromLocal(from: string, to: string) {
  const convert = (value: string) => (value ? new Date(`${value}-06:00`).toISOString() : undefined);
  const result = { from: convert(from), to: convert(to) };
  if (result.from && result.to && result.from >= result.to) throw new Error('El inicio debe ser anterior al final.');
  return result;
}
export { rangeKey };
