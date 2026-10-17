import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { DevicesRepository } from '../src/modules/devices/devices.repository.js';
import { DeviceCredentialsRepository } from '../src/modules/devices/device-credentials.repository.js';
import { SessionsRepository } from '../src/modules/sessions/sessions.repository.js';
import { MeasurementsRepository, type IngestInput } from '../src/modules/measurements/measurements.repository.js';
import { UsersRepository } from '../src/modules/users/users.repository.js';
import { provisionDemo, type DemoConfig } from '../src/scripts/demo-provisioning.js';

// Integration tests only run against an explicit disposable demo project.
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
describe.skipIf(!enabled)('Firestore + Auth emulators: persistence', () => {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? '';
  if (enabled && !projectId.startsWith('demo-')) throw new Error('Las pruebas requieren un proyecto demo- y ambos emuladores.');
  const app = enabled ? initializeApp({ projectId }, `persistence-${randomUUID()}`) : undefined;
  const db = app ? getFirestore(app) : undefined!;
  const auth = app ? getAuth(app) : undefined!;
  const devices = new DevicesRepository(() => db);
  const sessions = new SessionsRepository(() => db);
  const measurements = new MeasurementsRepository(() => db);
  const credentials = new DeviceCredentialsRepository(() => db);
  const prefix = randomUUID();
  const config: DemoConfig = { profiles: [
    { uid: `${prefix}-operator`, displayName: 'Operador de prueba', role: 'operator' },
    { uid: `${prefix}-admin`, displayName: 'Administrador de prueba', role: 'admin' },
  ], deviceId: `${prefix}-device`, credentialId: `${prefix}-credential`, secret: randomBytes(32).toString('base64url') };
  let sessionId: string;
  let original: IngestInput;

  beforeAll(async () => {
    for (const profile of config.profiles) await auth.createUser({ uid: profile.uid });
  }, 30000);
  afterAll(async () => { if (app) await deleteApp(app); });

  it('provisions once and preserves existing profiles, reservation and credential on reruns', async () => {
    expect(await provisionDemo(db, auth, config)).toEqual({ profilesCreated: 2, deviceCreated: true, credentialCreated: true });
    await db.collection('users').doc(config.profiles[0].uid).update({ enabled: false });
    await db.collection('devices').doc(config.deviceId).update({ lastSeenAt: '2026-10-17T00:00:00.000Z' });
    const before = (await db.collection('deviceCredentials').doc(config.credentialId).get()).data();
    expect(await provisionDemo(db, auth, config)).toEqual({ profilesCreated: 0, deviceCreated: false, credentialCreated: false });
    expect((await new UsersRepository(() => db).getById(config.profiles[0].uid))?.enabled).toBe(false);
    expect((await devices.getById(config.deviceId))?.lastSeenAt).toBe('2026-10-17T00:00:00.000Z');
    expect((await db.collection('deviceCredentials').doc(config.credentialId).get()).data()).toEqual(before);
    await expect(provisionDemo(db, auth, { ...config, secret: randomBytes(32).toString('base64url') })).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    expect((await db.collection('deviceCredentials').doc(config.credentialId).get()).data()).toEqual(before);
  });

  it('authenticates a device without returning its secret hash and rejects disabled/revoked credentials', async () => {
    const token = `${config.credentialId}.${config.secret}`;
    const device = await credentials.authenticate(token);
    expect(device?.deviceId).toBe(config.deviceId);
    expect(device).not.toHaveProperty('secretHash');
    expect(await credentials.authenticate(`${config.credentialId}.${randomBytes(32).toString('base64url')}`)).toBeNull();
    const ref = db.collection('deviceCredentials').doc(config.credentialId);
    await ref.update({ enabled: false });
    expect(await credentials.authenticate(token)).toBeNull();
    await ref.update({ enabled: true, revokedAt: new Date().toISOString() });
    expect(await credentials.authenticate(token)).toBeNull();
    await ref.update({ revokedAt: null });
  });

  it('executes the provisioning CLI with stable data and redacts failures', () => {
    const run = (secret: string) => spawnSync(process.execPath, [resolve('../../node_modules/tsx/dist/cli.mjs'), 'src/scripts/provision-demo.ts'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
      env: { ...process.env, DEMO_PROFILES_JSON: JSON.stringify(config.profiles), DEMO_DEVICE_ID: config.deviceId,
        DEMO_CREDENTIAL_ID: config.credentialId, DEMO_DEVICE_SECRET: secret },
    });
    const success = run(config.secret);
    expect(success.status).toBe(0);
    expect(success.stdout).toContain('profilesCreated: 0');
    expect(success.stdout).not.toContain(config.secret);
    const differentSecret = randomBytes(32).toString('base64url');
    const failure = run(differentSecret);
    expect(failure.status).toBe(1);
    expect(failure.stderr).toContain('Aprovisionamiento no completado');
    expect(failure.stderr + failure.stdout).not.toContain(differentSecret);
  }, 60000);

  it('allows one concurrent reservation and makes start/finish idempotent', async () => {
    const a = await sessions.create({ participantCode: 'P-001', operatorId: config.profiles[0].uid, deviceId: config.deviceId });
    const b = await sessions.create({ participantCode: 'P-002', operatorId: config.profiles[1].uid, deviceId: config.deviceId });
    await expect(sessions.finish(a.sessionId)).rejects.toMatchObject({ code: 'INVALID_SESSION_STATE' });
    const results = await Promise.allSettled([sessions.start(a.sessionId), sessions.start(b.sessionId)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const winner = results.find((result) => result.status === 'fulfilled');
    if (winner?.status !== 'fulfilled') throw new Error('No se reservó dispositivo');
    sessionId = winner.value.sessionId;
    expect(await sessions.start(sessionId)).toEqual(winner.value);
    expect((await devices.getById(config.deviceId))?.activeSessionId).toBe(sessionId);
    await provisionDemo(db, auth, config);
    expect((await devices.getById(config.deviceId))?.activeSessionId).toBe(sessionId);
    expect((await devices.getById(config.deviceId))?.lastSeenAt).toBe('2026-10-17T00:00:00.000Z');
  }, 30000);

  it('deduplicates concurrent normalized payloads atomically and persists quality/source', async () => {
    original = { sessionId, bootId: randomUUID(), sequence: 1, measurements: {
      heartRate: { value: null, unit: 'bpm', status: 'no_contact' },
      spo2: { value: null, unit: '%', status: 'no_contact' },
      skinTemperature: { value: 33.4, unit: 'C', status: 'valid' },
    } };
    const results = await Promise.all([measurements.ingest(config.deviceId, original), measurements.ingest(config.deviceId, original)]);
    expect(results.map((result) => result.duplicate).sort()).toEqual([false, true]);
    expect(results[0].measurementId).toBe(results[1].measurementId);
    expect(results[0].receivedAt).toBe(results[1].receivedAt);
    // Explicitly reorder nested JSON without dropping its fields.
    const reorderedPayload = { measurements: { skinTemperature: { status: 'valid', unit: 'C', value: 33.4 },
      spo2: { status: 'no_contact', unit: '%', value: null }, heartRate: { status: 'no_contact', unit: 'bpm', value: null } },
      capturedAt: null, sequence: 1, bootId: original.bootId, sessionId } as IngestInput;
    expect((await measurements.ingest(config.deviceId, reorderedPayload)).duplicate).toBe(true);
    await expect(measurements.ingest(config.deviceId, { ...original, capturedAt: '2026-10-17T00:00:00Z' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const stored = await measurements.getLatest(sessionId);
    expect(stored?.source).toBe('simulated');
    expect(stored?.measurements.heartRate).toEqual(original.measurements.heartRate);
    expect((await sessions.getById(sessionId))?.latestMeasurement).toEqual(stored);
    expect((await devices.getById(config.deviceId))?.lastSeenAt).toBe(stored?.receivedAt);
    expect((await db.collection('sessions').doc(sessionId).collection('measurements').count().get()).data().count).toBe(1);
  }, 30000);

  it('retains original duplicate response after finish and rejects new samples/reopening', async () => {
    const finished = await sessions.finish(sessionId);
    expect(await sessions.finish(sessionId)).toEqual(finished);
    expect((await devices.getById(config.deviceId))?.activeSessionId).toBeNull();
    expect((await measurements.ingest(config.deviceId, original)).duplicate).toBe(true);
    await expect(measurements.ingest(config.deviceId, { ...original, sequence: 2 })).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    await expect(sessions.start(sessionId)).rejects.toMatchObject({ code: 'INVALID_SESSION_STATE' });
    expect((await db.collection('sessions').doc(sessionId).collection('measurements').count().get()).data().count).toBe(1);
    // A new SDK instance reads persisted history, without any repository memory.
    const restartedApp = initializeApp({ projectId }, `restart-${randomUUID()}`);
    try {
      const latest = await new MeasurementsRepository(() => getFirestore(restartedApp)).getLatest(sessionId);
      expect(latest?.sequence).toBe(1);
    } finally { await deleteApp(restartedApp); }
  });

  it('paginates ties without gaps, bounds dates and binds cursors to filters and parent session', async () => {
    const parent = db.collection('sessions').doc(sessionId);
    const batch = db.batch();
    for (const id of ['a', 'b', 'c']) batch.set(parent.collection('measurements').doc(id), {
      id, ...original, deviceId: config.deviceId, source: 'simulated', receivedAt: '2020-01-01T00:00:00.000Z', capturedAt: null,
    });
    await batch.commit();
    const first = await measurements.list(sessionId, { limit: 2 });
    expect(first.data.map((row) => row.id)).toEqual([expect.any(String), 'c']);
    const second = await measurements.list(sessionId, { limit: 2, cursor: first.pagination.nextCursor! });
    expect(second.data.map((row) => row.id)).toEqual(['b', 'a']);
    expect(second.pagination).toEqual({ hasMore: false, nextCursor: null });
    await expect(measurements.list('other-session', { cursor: first.pagination.nextCursor! })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    const bounded = await measurements.list(sessionId, { from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z' });
    expect(bounded.data).toHaveLength(3);
    await expect(measurements.list(sessionId, { cursor: first.pagination.nextCursor!, from: '2020-01-01T00:00:00Z' })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    const owner = (await sessions.getById(sessionId))!.operatorId;
    expect((await sessions.list({ operatorId: owner, status: 'finished', deviceId: config.deviceId })).data.map((row) => row.sessionId)).toEqual([sessionId]);
    expect((await sessions.list({ operatorId: 'other-owner', status: 'finished', deviceId: config.deviceId })).data).toEqual([]);
  });

  it('denies direct client reads and writes with and without an authenticated identity', async () => {
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST!;
    const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
    });
    const identity = await signup.json() as { idToken: string };
    expect(signup.status).toBe(200);
    for (const token of [null, identity.idToken]) {
      const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/users/${config.profiles[0].uid}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      expect((await fetch(url, { headers })).status).toBe(403);
      expect((await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ fields: { role: { stringValue: 'admin' } } }) })).status).toBe(403);
    }
  });
});
