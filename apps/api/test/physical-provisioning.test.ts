import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import express from 'express';
import request from 'supertest';
import { provisionPhysicalDevice, type PhysicalDeviceConfig } from '../src/scripts/physical-device-provisioning.js';
import { DeviceCredentialsRepository } from '../src/modules/devices/device-credentials.repository.js';
import { DevicesRepository } from '../src/modules/devices/devices.repository.js';
import { PatientsRepository } from '../src/modules/patients/patients.repository.js';
import { AssignmentsRepository } from '../src/modules/assignments/assignments.repository.js';
import { SessionsRepository } from '../src/modules/sessions/sessions.repository.js';
import { MeasurementsRepository } from '../src/modules/measurements/measurements.repository.js';
import { createDeviceMeasurementsRouter } from '../src/modules/measurements/device-measurements.router.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
describe.skipIf(!enabled)('aprovisionamiento de NodeMCU (datos ficticios en emuladores)', () => {
  if (enabled && !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) throw new Error('Se requiere proyecto desechable.');
  const app = enabled ? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }, `physical-${randomUUID()}`) : undefined;
  const db = enabled ? getFirestore(app!) : undefined!;
  const auth = enabled ? getAuth(app!) : undefined!;
  let config: PhysicalDeviceConfig;
  afterAll(async () => { if (app) await deleteApp(app); });
  beforeEach(async () => {
    const id = randomUUID();
    config = { deviceId: `node-${id}`, credentialId: `cred-${id}`, code: `N-${id.slice(0, 8)}`,
      actorId: `admin-${id}`, secret: randomBytes(32).toString('base64url') };
    await auth.createUser({ uid: config.actorId });
    await db.collection('users').doc(config.actorId).create({ uid: config.actorId, role: 'admin', enabled: true });
  });

  it('dry-run no escribe; repetir apply conserva secreto, estado y auditoría', async () => {
    expect(await provisionPhysicalDevice(db, auth, config)).toMatchObject({ applied: false, deviceCreated: true });
    expect((await db.collection('devices').doc(config.deviceId).get()).exists).toBe(false);
    expect(await provisionPhysicalDevice(db, auth, config, true)).toMatchObject({ applied: true, credentialCreated: true });
    const credential = db.collection('deviceCredentials').doc(config.credentialId);
    const snapshot = (await credential.get()).data();
    expect(snapshot).not.toHaveProperty('secret');
    expect(snapshot?.secretHash).not.toBe(config.secret);
    await db.collection('devices').doc(config.deviceId).update({ activeAssignmentId: 'existing-reservation', lastSeenAt: '2026-10-22T00:00:00.000Z' });
    expect(await provisionPhysicalDevice(db, auth, config, true)).toMatchObject({ deviceCreated: false, credentialCreated: false });
    expect((await credential.get()).data()).toEqual(snapshot);
    expect((await db.collection('devices').doc(config.deviceId).get()).data()?.activeAssignmentId).toBe('existing-reservation');
    expect((await db.collection('auditLogs').where('targetId', '==', config.deviceId).get()).size).toBe(1);
  });

  it('no rota, no rehabilita credenciales y no convierte placas simuladas', async () => {
    await provisionPhysicalDevice(db, auth, config, true);
    await expect(provisionPhysicalDevice(db, auth, { ...config, secret: randomBytes(32).toString('base64url') }, true))
      .rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    await expect(provisionPhysicalDevice(db, auth, { ...config, credentialId: 'otra-credencial' }, true))
      .rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    await db.collection('deviceCredentials').doc(config.credentialId).update({ enabled: false });
    await expect(provisionPhysicalDevice(db, auth, config, true)).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    await db.collection('deviceCredentials').doc(config.credentialId).update({ enabled: true, revokedAt: new Date().toISOString() });
    await expect(provisionPhysicalDevice(db, auth, config, true)).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    await db.collection('devices').doc(config.deviceId).update({ source: 'simulated' });
    await expect(provisionPhysicalDevice(db, auth, config, true)).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
  });

  it('comprueba identidad y perfil admin actuales', async () => {
    await db.collection('users').doc(config.actorId).update({ role: 'viewer' });
    await expect(provisionPhysicalDevice(db, auth, config, true)).rejects.toMatchObject({ code: 'PROVISIONING_FORBIDDEN' });
    await db.collection('users').doc(config.actorId).update({ role: 'admin' });
    await auth.updateUser(config.actorId, { disabled: true });
    await expect(provisionPhysicalDevice(db, auth, config, true)).rejects.toMatchObject({ code: 'PROVISIONING_FORBIDDEN' });
    expect((await db.collection('devices').doc(config.deviceId).get()).exists).toBe(false);
  });

  it('reintentos concurrentes crean un registro y un único evento', async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => provisionPhysicalDevice(db, auth, config, true)));
    expect(results.filter(r => r.credentialCreated)).toHaveLength(1);
    expect((await db.collection('auditLogs').where('targetId', '==', config.deviceId).get()).size).toBe(1);
  }, 30000);

  it('credencial aprovisionada funciona por config/heartbeat/ingestión oficial con rechazos reales', async () => {
    await provisionPhysicalDevice(db, auth, config, true);
    const credentials = new DeviceCredentialsRepository(() => db);
    const devices = new DevicesRepository(() => db);
    const measurements = new MeasurementsRepository(() => db);
    const http = express(); http.use(express.json());
    http.use('/api/v1/device', createDeviceMeasurementsRouter({ credentialsRepo: credentials, devicesRepo: devices, measurementsRepo: measurements }));
    http.use(errorHandler);
    const bearer = `Bearer ${config.credentialId}.${config.secret}`;
    const route = '/api/v1/device';
    const initial = await request(http).get(`${route}/config`).set('Authorization', bearer);
    expect(initial.status).toBe(200); expect(initial.body.data.activeSessionId).toBeNull();
    expect(initial.text).not.toContain(config.secret); expect(initial.text).not.toContain('secretHash');
    expect((await request(http).get(`${route}/config`).set('Authorization', `Bearer ${config.credentialId}.${'x'.repeat(43)}`)).status).toBe(401);
    const beat = { deviceId: config.deviceId, bootId: randomUUID(), uptimeMs: 100, firmwareVersion: 'synthetic-test' };
    expect((await request(http).post(`${route}/heartbeat`).set('Authorization', bearer).send(beat)).status).toBe(200);
    expect((await request(http).post(`${route}/heartbeat`).set('Authorization', bearer).send({ ...beat, deviceId: 'otra-placa' })).status).toBe(403);
    const patient = await new PatientsRepository(() => db).create({ code: 'FICTICIO', displayName: 'Prueba sin hardware' }, config.actorId);
    const assignment = await new AssignmentsRepository(() => db).create({ patientId: patient.id, deviceId: config.deviceId }, config.actorId);
    const sessions = new SessionsRepository(() => db);
    const session = await sessions.createForAssignment(assignment.id, config.actorId);
    await sessions.start(session.sessionId, config.actorId);
    const input = { deviceId: config.deviceId, sessionId: session.sessionId, bootId: beat.bootId, sequence: 1, capturedAt: null,
      measurements: { heartRate: { value: 75, unit: 'bpm', status: 'valid' }, spo2: { value: 98, unit: '%', status: 'valid' }, skinTemperature: { value: 30, unit: 'C', status: 'valid' } } };
    expect((await request(http).post(`${route}/measurements`).set('Authorization', bearer).send(input)).status).toBe(201);
    const duplicate = await request(http).post(`${route}/measurements`).set('Authorization', bearer).send(input);
    expect(duplicate.status).toBe(200); expect(duplicate.body.data.duplicate).toBe(true);
    expect((await db.collectionGroup('measurements').where('patientId', '==', patient.id).get()).size).toBe(1);
    await db.collection('deviceCredentials').doc(config.credentialId).update({ enabled: false });
    expect((await request(http).get(`${route}/config`).set('Authorization', bearer)).status).toBe(401);
  }, 30000);

  it('CLI conserva el archivo privado y rechaza destinos equivocados sin imprimir secreto', () => {
    const folder = mkdtempSync(join(tmpdir(), 'pulsolink-physical-'));
    const file = join(folder, 'physical.json');
    const env = { ...process.env, PROVISION_TARGET_PROJECT: process.env.FIREBASE_PROJECT_ID, PROVISION_ACTOR_UID: config.actorId,
      PHYSICAL_DEVICE_ID: config.deviceId, PHYSICAL_DEVICE_CODE: config.code, PHYSICAL_DEVICE_CONFIG_FILE: file };
    const run = (overrides = {}) => spawnSync(process.execPath, [resolve('../../node_modules/tsx/dist/cli.mjs'), 'src/scripts/provision-physical-device.ts'],
      { env: { ...env, ...overrides }, cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
    try {
      const plan = run(); expect(plan.status).toBe(0); expect(plan.stdout).toContain('dry-run');
      const saved = readFileSync(file, 'utf8'); const secret = JSON.parse(saved).secret;
      for (let i = 0; i < 2; i++) {
        const result = run({ PROVISION_APPLY: 'true' }); expect(result.status).toBe(0);
        expect(result.stdout + result.stderr).not.toContain(secret);
        expect(readFileSync(file, 'utf8')).toBe(saved);
      }
      const mismatch = run({ PROVISION_TARGET_PROJECT: 'otro-proyecto', PROVISION_APPLY: 'true' });
      expect(mismatch.status).toBe(1); expect(mismatch.stdout + mismatch.stderr).not.toContain(secret);
    } finally {
      if (dirname(folder) === tmpdir() && folder.includes('pulsolink-physical-')) rmSync(folder, { recursive: true, force: true });
    }
  }, 90000);
});
