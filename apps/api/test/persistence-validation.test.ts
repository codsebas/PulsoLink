import { describe, expect, it } from 'vitest';
import { MeasurementsRepository } from '../src/modules/measurements/measurements.repository.js';
import { pagination, documentId, dateTime } from '../src/shared/persistence.js';
import { randomUUID } from 'node:crypto';

describe('persistence input boundaries', () => {
  it('rejects invalid quality, units and sequence before touching Firestore', async () => {
    const repo = new MeasurementsRepository(() => { throw new Error('No debe acceder a Firestore'); });
    const payload = { sessionId: 'session', bootId: randomUUID(), sequence: 1, measurements: {
      heartRate: { value: 78, unit: 'bpm', status: 'valid' }, spo2: { value: 97, unit: '%', status: 'valid' },
      skinTemperature: { value: 33, unit: 'C', status: 'valid' },
    } } as const;
    await expect(repo.ingest('device', { ...payload, sequence: 2 ** 32 })).rejects.toHaveProperty('name', 'ZodError');
    await expect(repo.ingest('device', { ...payload, measurements: { ...payload.measurements,
      heartRate: { value: 78, unit: 'bpm', status: 'no_contact' },
    } })).rejects.toHaveProperty('name', 'ZodError');
    await expect(repo.ingest('device', { ...payload, measurements: { ...payload.measurements,
      spo2: { value: 101, unit: '%', status: 'valid' },
    } })).rejects.toHaveProperty('name', 'ZodError');
    await expect(repo.ingest('device/another', payload)).rejects.toHaveProperty('name', 'ZodError');
  });
  it('rejects malformed, wrong-scope cursors and invalid page sizes', () => {
    expect(() => pagination({ cursor: 'not-json' }, {})).toThrow('cursor');
    expect(() => pagination({ limit: 101 }, {})).toThrow();
    const first = pagination({ limit: 1 }, { owner: 'a', order: 'desc' });
    const cursor = first.page(['a', 'b'], (id) => ({ id, date: '2026-10-17T00:00:00.000Z' })).pagination.nextCursor!;
    expect(() => pagination({ cursor }, { owner: 'b', order: 'desc' })).toThrow('cursor');
    expect(() => pagination({ cursor }, { owner: 'a', order: 'asc' })).toThrow('cursor');
  });

  it('enforces documentId constraints rejecting slashes and path traversal dots', () => {
    expect(() => documentId.parse('.')).toThrow();
    expect(() => documentId.parse('..')).toThrow();
    expect(() => documentId.parse('foo/bar')).toThrow();
    expect(() => documentId.parse('')).toThrow();
    expect(() => documentId.parse('a'.repeat(129))).toThrow();
    expect(documentId.parse('...')).toBe('...');
    expect(documentId.parse('patient-123')).toBe('patient-123');
    expect(documentId.parse('device.01')).toBe('device.01');
  });

  it('accepts UTC and offset datetimes and normalizes to UTC ISO string', () => {
    const utc = '2026-10-22T01:00:00.000Z';
    expect(dateTime.parse(utc)).toBe(utc);

    const withOffset = '2026-10-22T03:00:00+02:00';
    expect(dateTime.parse(withOffset)).toBe('2026-10-22T01:00:00.000Z');

    expect(() => dateTime.parse('2026-10-22T01:00:00')).toThrow();
    expect(() => dateTime.parse('invalid-date')).toThrow();
  });
});
