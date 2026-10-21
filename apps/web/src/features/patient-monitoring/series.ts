import type { PatientMeasurement } from './patient-monitoring.types';
import { comparePaths, measurementPath, uniqueReadings } from './history';

/**
 * Series temporales por magnitud para el dashboard del paciente.
 *
 * Las series son gráficas de valores puntuales: no son una onda PPG ni un ECG.
 * Un valor ausente (`no_contact`, `invalid`, `unavailable`) se conserva como
 * `null` y nunca se convierte en cero. Las desconexiones, los cambios de
 * sesión, asignación o placa se representan como huecos que la gráfica no une.
 */

export const MAGNITUDES = ['heartRate', 'spo2', 'skinTemperature'] as const;
export type Magnitude = (typeof MAGNITUDES)[number];

/** Separación a partir de la cual dos lecturas se consideran de tramos distintos. */
export const GAP_AFTER_MS = 10000;

export interface SeriesPoint {
  at: number;
  value: number | null;
}

export type MagnitudeSeries = Record<Magnitude, SeriesPoint[]>;

export interface TrendPoint {
  at: number;
  heartRate: number | null;
  spo2: number | null;
  skinTemperature: number | null;
}

/** Orden cronológico ascendente con desempate por ruta (inverso al del servidor). */
export function chronological(readings: readonly PatientMeasurement[]): PatientMeasurement[] {
  return uniqueReadings(readings).sort((a, b) => {
    const at = Date.parse(a.receivedAt);
    const bt = Date.parse(b.receivedAt);
    if (at !== bt) return at - bt;
    return comparePaths(measurementPath(a), measurementPath(b));
  });
}

/** Un tramo se interrumpe por tiempo o por cambiar de sesión, asignación o placa. */
export function isBreak(previous: PatientMeasurement, current: PatientMeasurement): boolean {
  return (
    Date.parse(current.receivedAt) - Date.parse(previous.receivedAt) > GAP_AFTER_MS ||
    previous.sessionId !== current.sessionId ||
    previous.assignmentId !== current.assignmentId ||
    previous.deviceId !== current.deviceId
  );
}

function valueOf(measurement: PatientMeasurement, magnitude: Magnitude): number | null {
  const reading = measurement.measurements[magnitude];
  return reading.status === 'valid' ? reading.value : null;
}

/**
 * Series por magnitud en orden cronológico. Un hueco se marca con un punto nulo
 * para que la gráfica no una tramos desconectados (`connectNulls=false`).
 */
export function buildSeries(readings: readonly PatientMeasurement[]): MagnitudeSeries {
  const sorted = chronological(readings);
  const series: MagnitudeSeries = { heartRate: [], spo2: [], skinTemperature: [] };
  let previous: PatientMeasurement | undefined;
  for (const reading of sorted) {
    const at = Date.parse(reading.receivedAt);
    if (previous && isBreak(previous, reading)) {
      const gapAt = (at + Date.parse(previous.receivedAt)) / 2;
      for (const magnitude of MAGNITUDES) series[magnitude].push({ at: gapAt, value: null });
    }
    for (const magnitude of MAGNITUDES) series[magnitude].push({ at, value: valueOf(reading, magnitude) });
    previous = reading;
  }
  return series;
}

/** Puntos combinados de las tres magnitudes, para una gráfica con varias series. */
export function trendPoints(readings: readonly PatientMeasurement[]): TrendPoint[] {
  const sorted = chronological(readings);
  const points: TrendPoint[] = [];
  let previous: PatientMeasurement | undefined;
  for (const reading of sorted) {
    const at = Date.parse(reading.receivedAt);
    if (previous && isBreak(previous, reading)) {
      const gapAt = (at + Date.parse(previous.receivedAt)) / 2;
      points.push({ at: gapAt, heartRate: null, spo2: null, skinTemperature: null });
    }
    points.push({ at, heartRate: valueOf(reading, 'heartRate'), spo2: valueOf(reading, 'spo2'), skinTemperature: valueOf(reading, 'skinTemperature') });
    previous = reading;
  }
  return points;
}
