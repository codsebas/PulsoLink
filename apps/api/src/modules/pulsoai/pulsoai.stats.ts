import type { StoredMeasurement } from '../measurements/measurements.repository.js';
import type { SessionDocument } from '../sessions/sessions.repository.js';
import type { Page, PageOptions } from '../../shared/persistence.js';

export const metricKeys = ['heartRate', 'spo2', 'skinTemperature'] as const;
export type MetricKey = typeof metricKeys[number];
export interface SummaryMetric {
  unit: 'bpm' | '%' | 'C'; validCount: number; mean: number | null; min: number | null; max: number | null;
  quality: Record<'valid' | 'no_contact' | 'invalid' | 'unavailable', number>;
}
export interface SummaryStats {
  source: 'real' | 'simulated'; durationSeconds: number | null; total: number;
  metrics: Record<MetricKey, SummaryMetric>;
}
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Bounded memory, complete cursor traversal of a closed, immutable session. */
export async function collectStats(session: SessionDocument,
  list: (options: PageOptions) => Promise<Page<StoredMeasurement>>, clock = Date.now): Promise<SummaryStats> {
  const started = clock();
  const make = (unit: SummaryMetric['unit']): SummaryMetric => ({ unit, validCount: 0, mean: null, min: null, max: null,
    quality: { valid: 0, no_contact: 0, invalid: 0, unavailable: 0 } });
  const stats: SummaryStats = { source: session.source, durationSeconds: session.startedAt && session.finishedAt
    ? Math.max(0, round((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 1000)) : null,
    total: 0, metrics: { heartRate: make('bpm'), spo2: make('%'), skinTemperature: make('C') } };
  const sums = { heartRate: 0, spo2: 0, skinTemperature: 0 };
  let cursor: string | undefined;
  do {
    if (clock() - started > 120_000) throw new Error('SUMMARY_TOO_LARGE');
    const page = await list({ limit: 100, ...(cursor ? { cursor } : {}) });
    if (clock() - started > 120_000) throw new Error('SUMMARY_TOO_LARGE');
    for (const row of page.data) {
      if (row.sessionId !== session.sessionId) throw new Error('INVALID_GENERATION');
      stats.total++;
      for (const key of metricKeys) {
        const value = row.measurements[key];
        const metric = stats.metrics[key];
        const valid = value.status === 'valid' && typeof value.value === 'number' && Number.isFinite(value.value);
        const status = value.status === 'valid' && !valid ? 'invalid' : value.status;
        metric.quality[status]++;
        if (valid) {
          const number = value.value!;
          metric.validCount++;
          sums[key] += number;
          metric.min = metric.min === null ? number : Math.min(metric.min, number);
          metric.max = metric.max === null ? number : Math.max(metric.max, number);
        }
      }
    }
    const next = page.pagination.nextCursor ?? undefined;
    if (page.pagination.hasMore && (!next || next === cursor)) throw new Error('INVALID_GENERATION');
    cursor = page.pagination.hasMore ? next : undefined;
  } while (cursor);
  for (const key of metricKeys) {
    const metric = stats.metrics[key];
    if (metric.validCount) metric.mean = round(sums[key] / metric.validCount);
  }
  return stats;
}

export interface Fact { id: string; wordings: [string, string] }
/** Only these server-authored facts can be published. No arbitrary model prose. */
export function summaryFacts(stats: SummaryStats): Fact[] {
  const source = stats.source === 'simulated' ? 'simulado' : 'real';
  const duration = stats.durationSeconds === null ? 'duración no disponible' : `${stats.durationSeconds} segundos de duración`;
  const facts: Fact[] = [{ id: 'overview', wordings: [
    `Sesión de origen ${source}: ${stats.total} registros y ${duration}.`,
    `Se recibieron ${stats.total} registros de origen ${source}, con ${duration}.`,
  ] }];
  const labels = { heartRate: 'Pulso', spo2: 'SpO₂ estimada', skinTemperature: 'Temperatura superficial' };
  for (const key of metricKeys) {
    const metric = stats.metrics[key];
    const unit = metric.unit === 'C' ? '°C' : metric.unit;
    const figures = metric.validCount ? `promedio ${metric.mean} ${unit}, mínimo ${metric.min} ${unit} y máximo ${metric.max} ${unit}` : 'sin valores válidos para calcular promedio o rango';
    facts.push({ id: key, wordings: [
      `${labels[key]}: ${metric.validCount} lecturas válidas; ${figures}.`,
      `Para ${labels[key].toLowerCase()} se obtuvieron ${metric.validCount} lecturas válidas: ${figures}.`,
    ] });
    const q = metric.quality;
    const quality = `${q.no_contact} sin contacto, ${q.invalid} inválidas y ${q.unavailable} no disponibles`;
    facts.push({ id: `${key}_quality`, wordings: [
      `${labels[key]}: ${quality}; excluidas únicamente de los cálculos de esta magnitud, sin borrar registros.`,
      `En ${labels[key].toLowerCase()} se excluyeron del cálculo ${quality}; los registros permanecen guardados.`,
    ] });
  }
  facts.push({ id: 'limits', wordings: [
    'Los agregados no permiten determinar tendencias ni la duración exacta de la falta de contacto.',
    'No se infieren tendencias, estabilidad ni duración de falta de contacto a partir de estos agregados.',
  ] });
  facts.push({ id: 'disclaimer', wordings: [
    'SpO₂ es una estimación académica y la temperatura es superficial, no corporal central. Prototipo no validado para uso clínico.',
    'Este prototipo académico no está validado para uso clínico: SpO₂ estimada y temperatura superficial, no corporal central.',
  ] });
  return facts;
}
