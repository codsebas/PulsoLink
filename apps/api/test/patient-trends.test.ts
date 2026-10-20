import { describe, expect, it } from 'vitest';
import { trendPoints, rangeFromLocal, formatVital } from '../../web/src/features/patient-monitoring/trends';
import type { PatientMeasurement } from '../../web/src/features/patient-monitoring/patient-monitoring.types';

function reading(id: string, sessionId: string, time: string, contact = true): PatientMeasurement {
  return { id, sessionId, patientId: 'patient', assignmentId: sessionId, deviceId: sessionId, source: 'simulated', bootId: 'boot', sequence: 0,
    capturedAt: null, receivedAt: time, measurements: { heartRate: { value: contact ? 78 : null, status: contact ? 'valid' : 'no_contact', unit: 'bpm' },
      spo2: { value: contact ? 97 : null, status: contact ? 'valid' : 'no_contact', unit: '%' }, skinTemperature: { value: 33, status: 'valid', unit: 'C' } } };
}
describe('patient trends', () => {
  it('retains same reading IDs from different sessions and leaves gaps between boards', () => {
    const a = reading('same', 's1', '2026-10-19T00:00:00Z');
    const b = reading('same', 's2', '2026-10-19T00:00:02Z');
    expect(trendPoints([b, a, a])).toEqual([{ at: Date.parse(a.receivedAt), heartRate: 78, spo2: 97, skinTemperature: 33 },
      { at: Date.parse(a.receivedAt) + 1000, heartRate: null, spo2: null, skinTemperature: null },
      { at: Date.parse(b.receivedAt), heartRate: 78, spo2: 97, skinTemperature: 33 }]);
  });
  it('keeps absent optical values null and gaps of more than 10 seconds', () => {
    const points = trendPoints([reading('a', 's', '2026-10-19T00:00:00Z'), reading('b', 's', '2026-10-19T00:00:20Z', false)]);
    expect(points).toHaveLength(3);
    expect(points[1].skinTemperature).toBeNull();
    expect(points[2]).toMatchObject({ heartRate: null, spo2: null, skinTemperature: 33 });
  });
  it('converts Guatemala filters to UTC and rejects inverted ranges', () => {
    expect(rangeFromLocal('2026-10-19T12:00', '2026-10-19T13:00')).toEqual({ from: '2026-10-19T18:00:00.000Z', to: '2026-10-19T19:00:00.000Z' });
    expect(() => rangeFromLocal('2026-10-19T13:00', '2026-10-19T12:00')).toThrow();
    expect(formatVital(33.1 + 0.2)).toBe('33.3');
    expect(formatVital(0)).toBe('0');
    expect(formatVital(null)).toBe('—');
  });
});
