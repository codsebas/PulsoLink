import { describe, expect, it } from 'vitest';
import { monitoringMeta } from '../src/modules/patients/patient-monitoring.service.js';
import type { StoredMeasurement } from '../src/modules/measurements/measurements.repository.js';

describe('monitoring quality and connectivity', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  const reading = (status: 'valid' | 'no_contact', seconds = 0) => ({ receivedAt: new Date(now - seconds * 1000).toISOString(),
    measurements: { heartRate: { value: status === 'valid' ? 78 : null, unit: 'bpm', status } } }) as StoredMeasurement;
  it('distinguishes connection from optical contact and stale measurements at exact thresholds', () => {
    expect(monitoringMeta(null, null, now).connectionState).toBe('disconnected');
    expect(monitoringMeta(reading('valid'), new Date(now - 45001).toISOString(), now).connectionState).toBe('disconnected');
    expect(monitoringMeta(reading('no_contact'), new Date(now).toISOString(), now).connectionState).toBe('connected_without_valid_reading');
    expect(monitoringMeta(reading('valid', 10), new Date(now - 45000).toISOString(), now).connectionState).toBe('connected_with_recent_reading');
    expect(monitoringMeta(reading('valid', 11), new Date(now).toISOString(), now).connectionState).toBe('connected_without_valid_reading');
  });
});
