import { afterAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { PatientsRepository } from '../src/modules/patients/patients.repository.js';
import { DevicesRepository } from '../src/modules/devices/devices.repository.js';
import { AssignmentsRepository } from '../src/modules/assignments/assignments.repository.js';
import { SessionsRepository } from '../src/modules/sessions/sessions.repository.js';
import { MeasurementsRepository, type IngestInput } from '../src/modules/measurements/measurements.repository.js';
import { AuditRepository } from '../src/modules/audit/audit.repository.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
describe.skipIf(!enabled)('PL2 patient persistence (Standard emulator)', () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (enabled && !projectId?.startsWith('demo-')) throw new Error('Solo proyecto demo-.');
  const app = enabled ? initializeApp({ projectId }, `patients-${randomUUID()}`) : undefined;
  const db = app ? getFirestore(app) : undefined!;
  const patients = new PatientsRepository(() => db);
  const devices = new DevicesRepository(() => db);
  const assignments = new AssignmentsRepository(() => db);
  const sessions = new SessionsRepository(() => db);
  const measurements = new MeasurementsRepository(() => db);
  const audit = new AuditRepository(() => db);
  const actor = `admin-${randomUUID()}`;
  afterAll(async () => { if (app) await deleteApp(app); });
  async function fixture() {
    return {
      patient: await patients.create({ code: 'P-TEST', displayName: 'Paciente seudónimo' }, actor),
      device: await devices.create({ code: 'SIM', source: 'simulated' }, actor),
    };
  }
  function payload(sessionId: string, deviceId: string): IngestInput {
    return { sessionId, deviceId, capturedAt: null, bootId: randomUUID(), sequence: 0, measurements: {
      heartRate: { value: null, unit: 'bpm', status: 'no_contact' }, spo2: { value: null, unit: '%', status: 'no_contact' },
      skinTemperature: { value: 32.5, unit: 'C', status: 'valid' },
    } };
  }
  it('allows one assignment per board under concurrent requests', async () => {
    const { patient, device } = await fixture();
    const other = await patients.create({ code: 'OTHER', displayName: 'Otro alias' }, actor);
    const results = await Promise.allSettled([assignments.create({ patientId: patient.id, deviceId: device.deviceId }, actor),
      assignments.create({ patientId: other.id, deviceId: device.deviceId }, actor)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((result) => result.status === 'rejected');
    expect(loser?.status === 'rejected' && loser.reason.code).toBe('ASSIGNMENT_CONFLICT');
    expect([(await patients.getById(patient.id))?.activeAssignmentId, (await patients.getById(other.id))?.activeAssignmentId].filter(Boolean)).toHaveLength(1);
  }, 30000);
  it('allows one board per patient and prevents disable while assigned', async () => {
    const { patient, device } = await fixture();
    const other = await devices.create({ code: 'SIM-2', source: 'simulated' }, actor);
    const results = await Promise.allSettled([assignments.create({ patientId: patient.id, deviceId: device.deviceId }, actor),
      assignments.create({ patientId: patient.id, deviceId: other.deviceId }, actor)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(patients.update(patient.id, { enabled: false }, actor)).rejects.toMatchObject({ code: 'ASSIGNMENT_IN_USE' });
    const assignment = await assignments.getById((await patients.getById(patient.id))!.activeAssignmentId!);
    await expect(devices.update(assignment!.deviceId, { enabled: false }, actor)).rejects.toMatchObject({ code: 'ASSIGNMENT_IN_USE' });
    await expect(devices.update(device.deviceId, { source: 'real' } as never, actor)).rejects.toHaveProperty('name', 'ZodError');
  }, 30000);
  it('reserves created sessions against concurrent create/close and keeps audit idempotent', async () => {
    const { patient, device } = await fixture();
    const assignment = await assignments.create({ patientId: patient.id, deviceId: device.deviceId }, actor);
    const results = await Promise.allSettled([sessions.createForAssignment(assignment.id, actor), sessions.createForAssignment(assignment.id, actor)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const success = results.find((result) => result.status === 'fulfilled');
    if (success?.status !== 'fulfilled') throw new Error('No session');
    const session = success.value;
    await expect(assignments.close(assignment.id, actor)).rejects.toMatchObject({ code: 'ASSIGNMENT_IN_USE' });
    const active = await sessions.start(session.sessionId, actor);
    expect(await sessions.start(session.sessionId, actor)).toEqual(active);
    const finished = await sessions.finish(session.sessionId, actor);
    expect(await sessions.finish(session.sessionId, actor)).toEqual(finished);
    const closed = await assignments.close(assignment.id, actor);
    expect(await assignments.close(assignment.id, 'another-admin')).toEqual(closed);
    expect((await patients.getById(patient.id))?.activeAssignmentId).toBeNull();
    expect((await devices.getById(device.deviceId))?.activeAssignmentId).toBeNull();
    const events = await audit.list({ actorId: actor, limit: 100 });
    expect(events.data.filter((event) => event.targetId === session.sessionId).map((event) => event.action).sort())
      .toEqual(['session.create', 'session.finish', 'session.start']);
  }, 30000);
  it('serializes assignment close against creation of a session', async () => {
    const { patient, device } = await fixture();
    const assignment = await assignments.create({ patientId: patient.id, deviceId: device.deviceId }, actor);
    const results = await Promise.allSettled([assignments.close(assignment.id, actor), sessions.createForAssignment(assignment.id, actor)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const stored = await assignments.getById(assignment.id);
    expect(Boolean(stored?.endedAt)).not.toBe(Boolean(stored?.openSessionId));
  }, 30000);
  it('preserves history across two boards and deduplicates after reassignment', async () => {
    const { patient, device } = await fixture();
    const first = await assignments.create({ patientId: patient.id, deviceId: device.deviceId }, actor);
    const s1 = await sessions.createForAssignment(first.id, actor);
    await sessions.start(s1.sessionId, actor);
    const sample = payload(s1.sessionId, device.deviceId);
    const [ack, duplicate] = await Promise.all([measurements.ingest(device.deviceId, sample), measurements.ingest(device.deviceId, sample)]);
    expect(ack.measurementId).toBe(duplicate.measurementId);
    expect([ack.duplicate, duplicate.duplicate].sort()).toEqual([false, true]);
    await sessions.finish(s1.sessionId, actor);
    await assignments.close(first.id, actor);
    const d2 = await devices.create({ code: 'SIM-2', source: 'simulated' }, actor);
    const second = await assignments.create({ patientId: patient.id, deviceId: d2.deviceId }, actor);
    const s2 = await sessions.createForAssignment(second.id, actor);
    await sessions.start(s2.sessionId, actor);
    await measurements.ingest(d2.deviceId, payload(s2.sessionId, d2.deviceId));
    expect((await measurements.ingest(device.deviceId, sample)).duplicate).toBe(true);
    await expect(measurements.ingest(device.deviceId, { ...sample, capturedAt: '2026-01-01T00:00:00Z' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(measurements.ingest(d2.deviceId, { ...payload(s2.sessionId, d2.deviceId), deviceId: device.deviceId })).rejects.toMatchObject({ code: 'DEVICE_ID_MISMATCH' });
    const history = await measurements.listByPatient(patient.id);
    expect(history.data).toHaveLength(2);
    expect(new Set(history.data.map((row) => row.deviceId))).toEqual(new Set([device.deviceId, d2.deviceId]));
    expect(history.data.find((row) => row.sessionId === s1.sessionId)?.assignmentId).toBe(first.id);
    expect(history.data.every((row) => row.patientId === patient.id)).toBe(true);
    const other = await patients.create({ code: 'EMPTY', displayName: 'Sin lecturas' }, actor);
    expect((await measurements.listByPatient(other.id)).data).toEqual([]);
    await devices.update(device.deviceId, { enabled: false }, actor);
    await expect(measurements.ingest(device.deviceId, sample)).rejects.toMatchObject({ code: 'DEVICE_DISABLED' });
  }, 30000);
  it('paginates equal dates and measurement IDs using full document paths', async () => {
    const patient = await patients.create({ code: 'TIES', displayName: 'Empates' }, actor);
    const sessionIds = [`s-${randomUUID()}`, `s-${randomUUID()}`].sort();
    for (const sessionId of sessionIds) {
      await db.collection('sessions').doc(sessionId).collection('measurements').doc('same-id').set({
        id: 'same-id', patientId: patient.id, assignmentId: 'confirmed-assignment', deviceId: 'device',
        ...payload(sessionId, 'device'), receivedAt: '2026-10-19T00:00:00.000Z', source: 'simulated',
      });
    }
    const first = await measurements.listByPatient(patient.id, { limit: 1 });
    const next = await measurements.listByPatient(patient.id, { cursor: first.pagination.nextCursor!, limit: 1 });
    expect(first.data[0].sessionId).toBe(sessionIds[1]);
    expect(next.data[0].sessionId).toBe(sessionIds[0]);
    expect(next.pagination.hasMore).toBe(false);
    await expect(measurements.listByPatient('other', { cursor: first.pagination.nextCursor! })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    expect((await measurements.listByPatient(patient.id, { to: '2026-10-19T00:00:00Z' })).data).toHaveLength(0);
    expect((await measurements.listByPatient(patient.id, { from: '2026-10-19T00:00:00Z' })).data).toHaveLength(2);
  });
  it('coordinates finish with a new ingestion without leaving orphan writes', async () => {
    const { patient, device } = await fixture();
    const assignment = await assignments.create({ patientId: patient.id, deviceId: device.deviceId }, actor);
    const session = await sessions.createForAssignment(assignment.id, actor);
    await sessions.start(session.sessionId, actor);
    const result = await Promise.allSettled([sessions.finish(session.sessionId, actor), measurements.ingest(device.deviceId, payload(session.sessionId, device.deviceId))]);
    expect(result[0].status).toBe('fulfilled');
    const rows = await measurements.listByPatient(patient.id);
    expect(rows.data.length).toBe(result[1].status === 'fulfilled' ? 1 : 0);
    expect((await assignments.getById(assignment.id))?.openSessionId).toBeNull();
    expect((await devices.getById(device.deviceId))?.activeSessionId).toBeNull();
    await expect(measurements.ingest(device.deviceId, payload(session.sessionId, device.deviceId))).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
  }, 30000);
  it('deduplicates access events and rejects arbitrary sensitive context', async () => {
    const viewId = randomUUID();
    const a = await audit.recordPatientView(actor, 'patient', viewId);
    expect(await audit.recordPatientView(actor, 'patient', viewId)).toEqual(a);
    await expect(audit.append({ actorId: actor, targetId: 'patient', targetType: 'patient', action: 'patient.view', context: { token: 'forbidden' } } as never, viewId)).rejects.toHaveProperty('name', 'ZodError');
    expect((await audit.list({ actorId: actor, action: 'patient.view' })).data).toHaveLength(1);
  });
});
