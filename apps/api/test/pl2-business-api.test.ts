import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createAuthMiddleware } from '../src/modules/auth/auth.middleware.js';
import { createAuthRouter } from '../src/modules/auth/auth.router.js';
import { createCsrf } from '../src/modules/auth/csrf.js';
import { InMemoryIdentityProvider } from '../src/modules/auth/adapters/in-memory-identity-provider.js';
import { InMemoryUserRepository } from '../src/modules/auth/adapters/in-memory-user-repository.js';
import { AssignmentsRepository } from '../src/modules/assignments/assignments.repository.js';
import { createAssignmentsRouter } from '../src/modules/assignments/assignments.routes.js';
import { AuditRepository } from '../src/modules/audit/audit.repository.js';
import { createDeviceAdminRouter } from '../src/modules/devices/devices.admin.routes.js';
import { DevicesRepository } from '../src/modules/devices/devices.repository.js';
import { createDevicesRouter } from '../src/modules/devices/devices.routes.js';
import { createDeviceMeasurementsRouter } from '../src/modules/measurements/device-measurements.router.js';
import { MeasurementsRepository } from '../src/modules/measurements/measurements.repository.js';
import { createPatientAdminRouter } from '../src/modules/patients/patients.admin.routes.js';
import { PatientMonitoringService } from '../src/modules/patients/patient-monitoring.service.js';
import { createPatientReadRouter } from '../src/modules/patients/patients.read.routes.js';
import { PatientsRepository } from '../src/modules/patients/patients.repository.js';
import { createSessionsRouter } from '../src/modules/sessions/sessions.routes.js';
import { SessionsRepository } from '../src/modules/sessions/sessions.repository.js';
import { SessionsService } from '../src/modules/sessions/sessions.service.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const origin = 'http://localhost:5173';
const people = [
  { uid: 'pl2-admin', email: 'admin@demo.local', password: 'Password123', role: 'admin' as const },
  { uid: 'pl2-viewer', email: 'viewer@demo.local', password: 'Password123', role: 'viewer' as const },
];

describe.skipIf(!enabled)('PL2 API HTTP con Firestore Standard emulado', () => {
  it('aplica permisos y preserva historia del paciente entre dos placas y sesiones', async () => {
    const projectId = process.env.FIREBASE_PROJECT_ID ?? '';
    if (!projectId.startsWith('demo-')) throw new Error('La prueba solo permite un proyecto demo-.');
    const firebase = initializeApp({ projectId }, `pl2-api-${randomUUID()}`);
    const db = getFirestore(firebase);
    let server: Server | undefined;
    try {
      const patients = new PatientsRepository(() => db);
      const devices = new DevicesRepository(() => db);
      const assignments = new AssignmentsRepository(() => db);
      const sessions = new SessionsRepository(() => db);
      const measurements = new MeasurementsRepository(() => db);
      const audit = new AuditRepository(() => db);
      const identity = new InMemoryIdentityProvider({ users: people });
      const users = new InMemoryUserRepository();
      for (const user of people) users.set({ id: user.uid, displayName: user.uid, role: user.role, enabled: true });
      const config = { firebaseWebApiKey: 'test', appOrigins: [origin], csrfSecret: 'test-csrf-secret-value-0123456789abcdef',
        cookieSecure: false, sessionTtlMs: 8 * 60 * 60 * 1000, loginRateLimit: { max: 100, windowMs: 900_000 } };
      const app = express();
      app.use(express.json({ limit: '8kb' }), cookieParser());
      app.use('/api/v1/auth', createAuthRouter({ config, identityProvider: identity, userRepository: users,
        auditRepository: { append: vi.fn(async () => ({}) as never) } }));
      const { requireUser } = createAuthMiddleware({ identityProvider: identity, userRepository: users });
      const csrf = createCsrf({ secret: config.csrfSecret, secure: false, origins: [origin] }).csrfProtection;
      app.use('/api/v1/patients', requireUser, createPatientReadRouter(new PatientMonitoringService(() => db), csrf));
      app.use('/api/v1/patients', requireUser, csrf, createPatientAdminRouter(patients));
      app.use('/api/v1/devices', requireUser, createDevicesRouter(devices));
      app.use('/api/v1/devices', requireUser, csrf, createDeviceAdminRouter(devices));
      app.use('/api/v1/assignments', requireUser, csrf, createAssignmentsRouter(assignments));
      app.use('/api/v1/sessions', requireUser, csrf, createSessionsRouter(new SessionsService({ sessions, devices, measurements })));
      app.use('/api/v1/device', createDeviceMeasurementsRouter({ credentialsRepo: {
        authenticate: async (token) => token === 'credential.demo-secret' ? devices.getById(activeDeviceId) : null,
      }, devicesRepo: devices, measurementsRepo: measurements }));
      app.use(errorHandler);
      server = app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server!.once('listening', resolve));

      async function login(index: number) {
        const agent = request.agent(server!);
        const first = await agent.get('/api/v1/auth/csrf');
        expect((await agent.post('/api/v1/auth/login').set('Origin', origin).set('X-CSRF-Token', first.body.data.csrfToken)
          .send({ email: people[index].email, password: people[index].password })).status).toBe(200);
        const refreshed = await agent.get('/api/v1/auth/csrf');
        const csrfToken = refreshed.body.data.csrfToken as string;
        return { agent, post: (url: string, body?: object) => {
          const call = agent.post(url).set('Origin', origin).set('X-CSRF-Token', csrfToken);
          return body ? call.send(body) : call;
        } };
      }
      let activeDeviceId = '';
      const admin = await login(0);
      const viewer = await login(1);
      expect((await viewer.post('/api/v1/patients', { code: 'NO', displayName: 'No autorizado' })).status).toBe(403);
      expect((await viewer.post('/api/v1/assignments', { patientId: 'x', deviceId: 'y' })).status).toBe(403);
      expect((await request(server).get('/api/v1/patients')).status).toBe(401);
      expect((await admin.agent.post('/api/v1/patients').set('Origin', origin)
        .send({ code: 'NO', displayName: 'Sin CSRF' })).status).toBe(403);

      const patientRes = await admin.post('/api/v1/patients', { code: 'P-001', displayName: 'Alias académico' });
      expect(patientRes.status).toBe(201);
      const patientId = patientRes.body.data.id as string;
      const board = await admin.post('/api/v1/devices', { code: 'SIM-1', source: 'simulated' });
      expect(board.status).toBe(201);
      const firstDeviceId = board.body.data.id as string;
      expect(board.body.data).not.toHaveProperty('activeAssignmentId');
      activeDeviceId = firstDeviceId;
      const unavailablePatient = await admin.post('/api/v1/patients', { code: 'P-DISABLED', displayName: 'Paciente deshabilitado de prueba' });
      expect(unavailablePatient.status).toBe(201);
      expect((await admin.agent.patch(`/api/v1/patients/${unavailablePatient.body.data.id}`).set('Origin', origin)
        .set('X-CSRF-Token', (await admin.agent.get('/api/v1/auth/csrf')).body.data.csrfToken)
        .send({ enabled: false })).status).toBe(200);
      const forbiddenAssignment = await admin.post('/api/v1/assignments', { patientId: unavailablePatient.body.data.id, deviceId: firstDeviceId });
      expect(forbiddenAssignment.status).toBe(403);
      expect(forbiddenAssignment.body.error.code).toBe('RESOURCE_DISABLED');
      expect((await viewer.agent.get('/api/v1/devices')).body.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: firstDeviceId, enabled: true }),
      ]));
      const assignmentRes = await admin.post('/api/v1/assignments', { patientId, deviceId: firstDeviceId });
      expect(assignmentRes.status).toBe(201);
      const assignmentId = assignmentRes.body.data.id as string;
      expect(assignmentRes.body.data).not.toHaveProperty('openSessionId');
      expect((await viewer.agent.get(`/api/v1/assignments?patientId=${patientId}&status=active`)).body.data)
        .toEqual([assignmentRes.body.data]);
      expect((await viewer.agent.get(`/api/v1/assignments/${assignmentId}`)).body.data)
        .toEqual(assignmentRes.body.data);
      expect((await admin.agent.patch(`/api/v1/patients/${patientId}`).set('Origin', origin)
        .set('X-CSRF-Token', (await admin.agent.get('/api/v1/auth/csrf')).body.data.csrfToken)
        .send({ enabled: false })).status).toBe(409);
      const busy = await admin.post('/api/v1/assignments', { patientId, deviceId: firstDeviceId });
      expect(busy.status).toBe(409);
      expect(busy.body.error.code).toBe('ASSIGNMENT_CONFLICT');
      const sessionRes = await admin.post('/api/v1/sessions', { assignmentId });
      expect(sessionRes.status).toBe(201);
      const firstSessionId = sessionRes.body.data.id as string;
      expect(sessionRes.body.data).toMatchObject({ patientId, deviceId: firstDeviceId, assignmentId });
      const assignmentInUse = await admin.post(`/api/v1/assignments/${assignmentId}/close`);
      expect(assignmentInUse.status).toBe(409);
      expect(assignmentInUse.body.error.code).toBe('ASSIGNMENT_IN_USE');
      const invalidFinish = await admin.post(`/api/v1/sessions/${firstSessionId}/finish`);
      expect(invalidFinish.status).toBe(409);
      expect(invalidFinish.body.error.code).toBe('INVALID_SESSION_STATE');
      expect((await admin.post(`/api/v1/sessions/${firstSessionId}/start`)).status).toBe(200);

      const sample = (deviceId: string, sessionId: string) => ({ deviceId, sessionId, capturedAt: null,
        bootId: randomUUID(), sequence: 1, measurements: {
          heartRate: { value: null, unit: 'bpm', status: 'no_contact' },
          spo2: { value: null, unit: '%', status: 'no_contact' },
          skinTemperature: { value: 33.4, unit: 'C', status: 'valid' },
        },
      });
      const send = (body: object) => request(server).post('/api/v1/device/measurements')
        .set('Authorization', 'Bearer credential.demo-secret').send(body);
      const firstSample = sample(firstDeviceId, firstSessionId);
      expect((await request(server!).post('/api/v1/device/heartbeat')
        .set('Authorization', 'Bearer credential.demo-secret')
        .send({ deviceId: 'another-device', bootId: randomUUID(), uptimeMs: 100 })).body.error.code)
        .toBe('DEVICE_ID_MISMATCH');
      expect((await request(server!).post('/api/v1/device/heartbeat')
        .set('Authorization', 'Bearer credential.demo-secret')
        .send({ deviceId: firstDeviceId, bootId: randomUUID(), uptimeMs: 100 })).status).toBe(200);
      const { capturedAt: _omitted, ...missingClock } = firstSample;
      expect((await send(missingClock)).status).toBe(400);
      const mismatched = await send({ ...firstSample, deviceId: 'another-device' });
      expect(mismatched.status).toBe(403);
      expect(mismatched.body.error.code).toBe('DEVICE_ID_MISMATCH');
      expect((await send(firstSample)).status).toBe(201);
      const sessionLatest = await viewer.agent.get(`/api/v1/sessions/${firstSessionId}/latest`);
      expect(sessionLatest.status).toBe(200);
      expect(sessionLatest.body.meta.connectionState).toBe('connected_with_recent_reading');
      expect(sessionLatest.body.data.measurements.heartRate.value).toBeNull();
      const duplicate = await send(firstSample);
      expect(duplicate.status).toBe(200);
      expect(duplicate.body.data.duplicate).toBe(true);
      expect(duplicate.body.data.measurementId).toBe((await measurements.listByPatient(patientId)).data[0].id);
      const conflict = await send({ ...firstSample, capturedAt: '2026-10-20T00:00:00Z' });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect((await viewer.agent.get(`/api/v1/patients/${patientId}/measurements`)).body.data).toHaveLength(1);
      expect((await admin.post(`/api/v1/sessions/${firstSessionId}/finish`)).status).toBe(200);
      expect((await admin.post(`/api/v1/assignments/${assignmentId}/close`)).status).toBe(200);
      const inactive = await send(sample(firstDeviceId, firstSessionId));
      expect(inactive.status).toBe(409);
      expect(inactive.body.error.code).toBe('SESSION_NOT_ACTIVE');

      const secondBoard = await admin.post('/api/v1/devices', { code: 'SIM-2', source: 'simulated' });
      expect(secondBoard.status).toBe(201);
      const secondDeviceId = secondBoard.body.data.id as string;
      const secondAssignment = await admin.post('/api/v1/assignments', { patientId, deviceId: secondDeviceId });
      expect(secondAssignment.status).toBe(201);
      const secondSession = await admin.post('/api/v1/sessions', { assignmentId: secondAssignment.body.data.id });
      expect(secondSession.status).toBe(201);
      expect((await admin.post(`/api/v1/sessions/${secondSession.body.data.id}/start`)).status).toBe(200);
      activeDeviceId = secondDeviceId;
      expect((await send(sample(secondDeviceId, secondSession.body.data.id))).status).toBe(201);
      activeDeviceId = firstDeviceId;
      expect((await send(firstSample)).body.data).toEqual(duplicate.body.data);
      activeDeviceId = secondDeviceId;
      const history = await viewer.agent.get(`/api/v1/patients/${patientId}/measurements?limit=1`);
      expect(history.status).toBe(200);
      expect(history.body.pagination.hasMore).toBe(true);
      const wrongCursor = await admin.agent.get(`/api/v1/patients/${unavailablePatient.body.data.id}/measurements`)
        .query({ cursor: history.body.pagination.nextCursor });
      expect(wrongCursor.status).toBe(400);
      expect(wrongCursor.body.error.code).toBe('INVALID_CURSOR');
      const next = await viewer.agent.get(`/api/v1/patients/${patientId}/measurements`)
        .query({ limit: 1, cursor: history.body.pagination.nextCursor });
      expect(next.status).toBe(200);
      expect(new Set([history.body.data[0].deviceId, next.body.data[0].deviceId]))
        .toEqual(new Set([firstDeviceId, secondDeviceId]));
      expect((await viewer.agent.get('/api/v1/devices?enabled=false')).status).toBe(403);
      expect((await viewer.agent.get(`/api/v1/devices/${secondDeviceId}`)).status).toBe(200);
      expect((await viewer.agent.patch(`/api/v1/devices/${firstDeviceId}`).set('Origin', origin)
        .set('X-CSRF-Token', (await viewer.agent.get('/api/v1/auth/csrf')).body.data.csrfToken)
        .send({ enabled: false })).status).toBe(403);
      expect((await admin.agent.patch(`/api/v1/devices/${firstDeviceId}`).set('Origin', origin)
        .set('X-CSRF-Token', (await admin.agent.get('/api/v1/auth/csrf')).body.data.csrfToken)
        .send({ enabled: false })).status).toBe(200);
      expect((await admin.agent.get('/api/v1/devices?enabled=false')).body.data)
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: firstDeviceId, enabled: false })]));
      expect((await viewer.agent.get(`/api/v1/devices/${firstDeviceId}`)).status).toBe(403);
      expect((await admin.post(`/api/v1/sessions/${secondSession.body.data.id}/finish`)).status).toBe(200);
      expect((await admin.post(`/api/v1/assignments/${secondAssignment.body.data.id}/close`)).status).toBe(200);
      const disabledPatient = await admin.agent.patch(`/api/v1/patients/${patientId}`).set('Origin', origin)
        .set('X-CSRF-Token', (await admin.agent.get('/api/v1/auth/csrf')).body.data.csrfToken)
        .send({ enabled: false });
      expect(disabledPatient.status).toBe(200);
      expect((await viewer.agent.get(`/api/v1/patients/${patientId}`)).status).toBe(403);
      expect((await viewer.agent.get(`/api/v1/patients/${patientId}/measurements`)).status).toBe(403);
      expect((await admin.agent.get(`/api/v1/patients/${patientId}`)).status).toBe(200);
      const events = await audit.list({ actorId: people[0].uid, limit: 100 });
      expect(events.data.map((event) => event.action)).toEqual(expect.arrayContaining([
        'patient.create', 'device.create', 'assignment.create', 'session.create', 'session.start', 'session.finish', 'assignment.close',
      ]));
    } finally {
      if (server) await new Promise<void>((resolve) => server!.close(resolve));
      await deleteApp(firebase);
    }
  }, 45000);
});
