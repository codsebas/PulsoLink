import { describe, expect, it } from 'vitest';
import {
  MAX_HISTORY_SAMPLES,
  compareServerOrder,
  coverageOf,
  mergeMeasurements,
  rangeKey,
  uniqueReadings,
} from '../src/features/patient-monitoring/history';
import { monitoringKeys } from '../src/features/patient-monitoring/keys';
import { reading } from './helpers';

describe('historial del paciente', () => {
  it('conserva el orden del servidor: receivedAt DESC y ruta completa DESC en empates', () => {
    const first = reading({ id: 'm1', sessionId: 's1', receivedAt: '2026-10-19T10:00:00.000Z' });
    const second = reading({ id: 'm2', sessionId: 's1', receivedAt: '2026-10-19T10:00:00.000Z' });
    const older = reading({ id: 'm0', sessionId: 's1', receivedAt: '2026-10-19T09:59:58.000Z' });
    const merged = mergeMeasurements([older, first], [second]);
    expect(merged.map((row) => row.id)).toEqual(['m2', 'm1', 'm0']);
    expect(compareServerOrder(first, second)).toBeGreaterThan(0);
  });

  it('no duplica lecturas repetidas dentro de una página ni entre páginas', () => {
    const a = reading({ id: 'a', receivedAt: '2026-10-19T10:00:00.000Z' });
    const b = reading({ id: 'b', receivedAt: '2026-10-19T10:00:01.000Z' });
    const merged = mergeMeasurements([a, b], [b, a], [a]);
    expect(merged.map((row) => row.id)).toEqual(['b', 'a']);
    expect(uniqueReadings([a, a, b])).toHaveLength(2);
  });

  it('distingue lecturas con el mismo ID pero de sesiones distintas', () => {
    const a = reading({ id: 'same', sessionId: 's1', receivedAt: '2026-10-19T10:00:00.000Z' });
    const b = reading({ id: 'same', sessionId: 's2', receivedAt: '2026-10-19T10:00:02.000Z' });
    expect(mergeMeasurements([a], [b])).toHaveLength(2);
  });

  it('declara la cobertura y el truncamiento sin ocultar lo descartado', () => {
    const readings = Array.from({ length: 5 }, (_, index) =>
      reading({ id: `m${index}`, receivedAt: new Date(Date.parse('2026-10-19T10:00:00.000Z') - index * 1000).toISOString() })
    );
    const coverage = coverageOf(readings, { hasMore: true, pagesLoaded: 1, limit: 3 });
    expect(coverage).toMatchObject({ loaded: 3, pagesLoaded: 1, hasMore: true, complete: false, truncated: true, dropped: 2 });
    expect(coverage.newestReceivedAt).toBe(readings[0].receivedAt);
    expect(coverage.oldestReceivedAt).toBe(readings[2].receivedAt);

    const complete = coverageOf(readings, { hasMore: false, pagesLoaded: 2 });
    expect(complete.complete).toBe(true);
    expect(complete.truncated).toBe(false);
    expect(complete.dropped).toBe(0);
    expect(MAX_HISTORY_SAMPLES).toBeGreaterThan(100);
  });

  it('aísla la caché por paciente y por rango consultado', () => {
    const range = { from: '2026-10-19T00:00:00.000Z', to: '2026-10-20T00:00:00.000Z' };
    expect(monitoringKeys.historyArchive('patient-a', range)).not.toEqual(monitoringKeys.historyArchive('patient-b', range));
    expect(monitoringKeys.historyArchive('patient-a', range)).not.toEqual(
      monitoringKeys.historyArchive('patient-a', { ...range, to: '2026-10-21T00:00:00.000Z' })
    );
    expect(monitoringKeys.historyLive('patient-a', range)).not.toEqual(monitoringKeys.historyArchive('patient-a', range));
    expect(rangeKey(range)).toBe(rangeKey({ ...range }));
    expect(rangeKey({ from: 'a' })).not.toBe(rangeKey({ to: 'a' }));
  });
});
