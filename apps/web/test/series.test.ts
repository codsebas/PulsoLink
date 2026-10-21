import { describe, expect, it } from 'vitest';
import { buildSeries, chronological, isBreak, trendPoints } from '../src/features/patient-monitoring/series';
import { reading } from './helpers';

describe('series de signos vitales', () => {
  it('ordena cronológicamente y desempata por ruta', () => {
    const a = reading({ id: 'a', sessionId: 'sesion-a', receivedAt: '2026-10-19T10:00:00.000Z' });
    const b = reading({ id: 'b', sessionId: 'sesion-a', receivedAt: '2026-10-19T10:00:02.000Z' });
    const tie = reading({ id: 'c', sessionId: 'sesion-b', receivedAt: '2026-10-19T10:00:00.000Z' });
    expect(chronological([b, tie, a]).map((row) => row.id)).toEqual(['a', 'c', 'b']);
  });

  it('conserva los valores ausentes como null y nunca como cero', () => {
    const withoutContact = reading({
      id: 'a',
      receivedAt: '2026-10-19T10:00:00.000Z',
      heartRate: { value: null, status: 'no_contact' },
      spo2: { value: null, status: 'unavailable' },
    });
    const series = buildSeries([withoutContact]);
    expect(series.heartRate).toEqual([{ at: Date.parse(withoutContact.receivedAt), value: null }]);
    expect(series.spo2[0].value).toBeNull();
    expect(series.skinTemperature[0].value).toBe(33.2);
    expect(series.heartRate.some((point) => point.value === 0)).toBe(false);
  });

  it('abre un hueco cuando pasa más de diez segundos o cambia de placa', () => {
    const first = reading({ id: 'a', sessionId: 's1', deviceId: 'device-1', receivedAt: '2026-10-19T10:00:00.000Z' });
    const late = reading({ id: 'b', sessionId: 's1', deviceId: 'device-1', receivedAt: '2026-10-19T10:00:20.000Z' });
    const otherBoard = reading({ id: 'c', sessionId: 's2', deviceId: 'device-2', receivedAt: '2026-10-19T10:00:22.000Z' });
    expect(isBreak(first, late)).toBe(true);
    expect(isBreak(late, otherBoard)).toBe(true);
    const series = buildSeries([first, late, otherBoard]);
    // Un punto nulo por hueco: tiempo sin muestras y cambio de placa.
    expect(series.heartRate.map((point) => point.value)).toEqual([78, null, 78, null, 78]);
    const points = trendPoints([first, late]);
    expect(points).toHaveLength(3);
    expect(points[1]).toEqual({ at: Date.parse('2026-10-19T10:00:10.000Z'), heartRate: null, spo2: null, skinTemperature: null });
  });

  it('mantiene en la misma serie las lecturas históricas de distintas placas', () => {
    const board1 = reading({ id: 'a', sessionId: 's1', deviceId: 'device-1', receivedAt: '2026-10-19T10:00:00.000Z' });
    const board2 = reading({ id: 'b', sessionId: 's2', deviceId: 'device-2', receivedAt: '2026-10-19T10:05:00.000Z' });
    const series = buildSeries([board2, board1]);
    expect(series.heartRate.map((point) => point.value)).toEqual([78, null, 78]);
  });
});
