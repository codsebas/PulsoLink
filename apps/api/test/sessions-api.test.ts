import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createAuthMiddleware } from '../src/modules/auth/auth.middleware.js';
import { createAuthRouter } from '../src/modules/auth/auth.router.js';
import { createCsrf } from '../src/modules/auth/csrf.js';
import { InMemoryIdentityProvider } from '../src/modules/auth/adapters/in-memory-identity-provider.js';
import { InMemoryUserRepository } from '../src/modules/auth/adapters/in-memory-user-repository.js';
import { createDevicesRouter } from '../src/modules/devices/devices.routes.js';
import { DevicesRepository } from '../src/modules/devices/devices.repository.js';
import { PatientsRepository } from '../src/modules/patients/patients.repository.js';
import { AssignmentsRepository } from '../src/modules/assignments/assignments.repository.js';
import { createSessionsRouter } from '../src/modules/sessions/sessions.routes.js';
import { SessionsService, type SessionsDependencies } from '../src/modules/sessions/sessions.service.js';
import { SessionsRepository, type SessionDocument } from '../src/modules/sessions/sessions.repository.js';
import { MeasurementsRepository, type StoredMeasurement } from '../src/modules/measurements/measurements.repository.js';
import { PersistenceError } from '../src/shared/persistence.js';
import { SummaryService } from '../src/modules/pulsoai/pulsoai.service.js';
import { pendingSummary } from '../src/modules/pulsoai/pulsoai.repository.js';

const origin = 'http://localhost:5173';
const operator = { uid: 'operator', email: 'operator@test.local', password: 'Password123' };
const other = { uid: 'other', email: 'other@test.local', password: 'Password123' };
const admin = { uid: 'admin', email: 'admin@test.local', password: 'Password123' };

const ownSession: SessionDocument = {
  sessionId: 'session-1', participantCode: 'P-001', operatorId: operator.uid,
  deviceId: 'device-1', source: 'simulated', status: 'created',
  createdAt: '2026-10-17T01:00:00.000Z', startedAt: null, finishedAt: null, latestMeasurement: null,
};
const measurement: StoredMeasurement = {
  id: 'measurement-1', sessionId: ownSession.sessionId, deviceId: ownSession.deviceId,
  source: 'simulated', bootId: 'cad685e0-4258-4c9d-af3a-9a193b1e5f20', sequence: 1,
  capturedAt: null, receivedAt: new Date(Date.now() - 11_000).toISOString(),
  measurements: {
    heartRate: { value: null, unit: 'bpm', status: 'no_contact' },
    spo2: { value: null, unit: '%', status: 'no_contact' },
    skinTemperature: { value: 33.4, unit: 'C', status: 'valid' },
  },
};

function setup(real?: { deps: SessionsDependencies; devices: DevicesRepository }) {
  const identityProvider = new InMemoryIdentityProvider({ users: [operator, other, admin] });
  const userRepository = new InMemoryUserRepository();
  userRepository.set({ id: operator.uid, displayName: 'Operador', role: 'viewer', enabled: true });
  userRepository.set({ id: other.uid, displayName: 'Otro', role: 'viewer', enabled: true });
  userRepository.set({ id: admin.uid, displayName: 'Admin', role: 'admin', enabled: true });
  const config = {
    firebaseWebApiKey: 'test', appOrigins: [origin], csrfSecret: 'test-csrf-secret-value-0123456789abcdef',
    cookieSecure: false, sessionTtlMs: 8 * 60 * 60 * 1000, loginRateLimit: { max: 100, windowMs: 900_000 },
  };
  const getById = vi.fn(async (id: string) => id === ownSession.sessionId ? ownSession : null);
  const create = vi.fn(async (assignmentId: string, actorId: string) => ({
    ...ownSession, patientId: 'patient-1', assignmentId, operatorId: actorId, participantCode: undefined,
  }));
  const start = vi.fn(async () => ({ ...ownSession, status: 'active' as const, startedAt: new Date().toISOString() }));
  const finish = vi.fn(async () => ({ ...ownSession, status: 'finished' as const, finishedAt: new Date().toISOString() }));
  const list = vi.fn(async () => ({ data: [ownSession], pagination: { nextCursor: null, hasMore: false } }));
  const getLatest = vi.fn(async () => measurement);
  const listMeasurements = vi.fn(async () => ({ data: [measurement], pagination: { nextCursor: null, hasMore: false } }));
  const listDevices = vi.fn(async () => ({ data: [{
    deviceId: 'device-1', code: 'SIM-001', board: 'NodeMCU', source: 'simulated' as const,
    enabled: true, activeSessionId: null, lastSeenAt: new Date().toISOString(),
  }], pagination: { nextCursor: null, hasMore: false } }));
  const getDevice = vi.fn(async () => ({
    deviceId: 'device-1', code: 'SIM-001', board: 'NodeMCU', source: 'simulated' as const,
    enabled: true, activeSessionId: null, lastSeenAt: new Date().toISOString(),
  }));
  const deps: SessionsDependencies = {
    sessions: { getById, createForAssignment: create, start, finish, list },
    measurements: { getLatest, list: listMeasurements },
    devices: { getById: getDevice },
  };
  const app = express();
  app.use(express.json({ limit: '8kb' }), cookieParser());
  const auditRepository = { append: vi.fn(async () => ({}) as never) };
  app.use('/api/v1/auth', createAuthRouter({ config, identityProvider, userRepository, auditRepository }));
  const { requireUser } = createAuthMiddleware({ identityProvider, userRepository });
  const { csrfProtection } = createCsrf({ secret: config.csrfSecret, secure: false, origins: [origin] });
  app.use('/api/v1/devices', requireUser, createDevicesRouter(real?.devices ?? { list: listDevices }));
  const summaryJobs = { get: vi.fn(async () => null), request: vi.fn(async (id: string) => pendingSummary(id, new Date().toISOString())) };
  app.use('/api/v1/sessions', requireUser, csrfProtection, createSessionsRouter(new SessionsService(real?.deps ?? deps),
    new SummaryService(real?.deps.sessions ?? { getById }, summaryJobs)));
  app.use(errorHandler);

  async function login(user: typeof operator) {
    const agent = request.agent(app);
    const csrfResponse = await agent.get('/api/v1/auth/csrf');
    const response = await agent.post('/api/v1/auth/login').set('Origin', origin)
      .set('X-CSRF-Token', csrfResponse.body.data.csrfToken)
      .send({ email: user.email, password: user.password });
    expect(response.status).toBe(200);
    const rotated = await agent.get('/api/v1/auth/csrf');
    return { agent, csrf: rotated.body.data.csrfToken as string };
  }

  return { app, login, getById, create, start, finish, list, getLatest, listMeasurements, listDevices, summaryJobs };
}

describe('Contrato B: dispositivos y sesiones', () => {
  it('PulsoAI exige cookie, CSRF y admin para solicitar; viewer solo consulta sin generar', async () => {
    const { app, login, getById, summaryJobs } = setup();
    expect((await request(app).get('/api/v1/sessions/session-1/summary')).status).toBe(401);
    const viewer = await login(operator);
    expect((await viewer.agent.get('/api/v1/sessions/session-1/summary')).body.data.status).toBe('not_requested');
    expect(summaryJobs.request).not.toHaveBeenCalled();
    expect((await viewer.agent.post('/api/v1/sessions/session-1/summary/retry').set('Origin', origin).set('X-CSRF-Token', viewer.csrf).send({})).status).toBe(403);
    const administrator = await login(admin);
    expect((await administrator.agent.post('/api/v1/sessions/session-1/summary/retry').set('Origin', origin).send({})).status).toBe(403);
    getById.mockImplementation(async id => id === ownSession.sessionId ? { ...ownSession, status: 'finished' } : null);
    expect((await administrator.agent.post('/api/v1/sessions/session-1/summary/retry').set('Origin', origin).set('X-CSRF-Token', administrator.csrf).send({})).status).toBe(202);
    expect(summaryJobs.request).toHaveBeenCalledOnce();
    expect((await administrator.agent.get('/api/v1/sessions/missing/summary')).status).toBe(404);
  });
  it('exige sesión web y CSRF en mutaciones antes de tocar la persistencia', async () => {
    const { app, login, create } = setup();
    expect((await request(app).get('/api/v1/devices')).status).toBe(401);
    expect((await request(app).get('/api/v1/sessions')).status).toBe(401);
    const { agent } = await login(operator);
    const denied = await agent.post('/api/v1/sessions').set('Origin', origin)
      .send({ assignmentId: 'assignment-1' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('CSRF_INVALID');
    expect(create).not.toHaveBeenCalled();
  });

  it('viewer y administrador consultan todas las sesiones sin filtro de propietario', async () => {
    const { login, list } = setup();
    const viewerAgent = await login(operator);
    const response = await viewerAgent.agent.get('/api/v1/sessions?limit=20&status=created');
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ nextCursor: null, hasMore: false });
    expect(response.body.data[0]).toHaveProperty('id', 'session-1');
    expect(response.body.data[0]).not.toHaveProperty('latestMeasurement');
    expect(list).toHaveBeenCalledWith({ limit: 20, status: 'created' });
    const adminAgent = await login(admin);
    expect((await adminAgent.agent.get('/api/v1/sessions')).status).toBe(200);
    expect(list).toHaveBeenLastCalledWith({});
  });

  it('viewer consulta sesiones ajenas pero no puede iniciar ni finalizar', async () => {
    const { login, start, finish, getLatest, listMeasurements } = setup();
    const { agent, csrf } = await login(other);
    for (const route of ['/session-1', '/session-1/latest', '/session-1/measurements']) {
      expect((await agent.get(`/api/v1/sessions${route}`)).status).toBe(200);
    }
    for (const action of ['start', 'finish']) {
      const response = await agent.post(`/api/v1/sessions/session-1/${action}`)
        .set('Origin', origin).set('X-CSRF-Token', csrf);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect(start).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
    expect(getLatest).toHaveBeenCalled();
    expect(listMeasurements).toHaveBeenCalled();
  });

  it('crea sesiones desde la asignación con el administrador autenticado y traduce conflictos', async () => {
    const { login, create, start } = setup();
    const { agent, csrf } = await login(admin);
    const response = await agent.post('/api/v1/sessions').set('Origin', origin).set('X-CSRF-Token', csrf)
      .send({ assignmentId: 'assignment-1' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: 'session-1', patientId: 'patient-1', assignmentId: 'assignment-1', status: 'created' });
    expect(create).toHaveBeenCalledWith('assignment-1', admin.uid);
    create.mockRejectedValueOnce(new PersistenceError('RESOURCE_DISABLED', 'Paciente o placa deshabilitados.'));
    const disabled = await agent.post('/api/v1/sessions').set('Origin', origin).set('X-CSRF-Token', csrf)
      .send({ assignmentId: 'assignment-1' });
    expect(disabled.status).toBe(403);
    expect((await agent.post('/api/v1/sessions').set('Origin', origin).set('X-CSRF-Token', csrf)
      .send({ participantCode: 'P-001', deviceId: 'device-1' })).status).toBe(400);
    for (const assignmentId of ['.', '..']) {
      const invalid = await agent.post('/api/v1/sessions').set('Origin', origin).set('X-CSRF-Token', csrf)
        .send({ assignmentId });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    }
    start.mockRejectedValueOnce(new PersistenceError('DEVICE_BUSY', 'El dispositivo ya está reservado.'));
    const busy = await agent.post('/api/v1/sessions/session-1/start').set('Origin', origin).set('X-CSRF-Token', csrf);
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('DEVICE_BUSY');
  });

  it('devuelve metadatos de antigüedad y calidad sin convertir null en cero', async () => {
    const { login } = setup();
    const { agent } = await login(operator);
    const result = await agent.get('/api/v1/sessions/session-1/latest');
    expect(result.status).toBe(200);
    expect(result.body.data.measurements.heartRate).toEqual({ value: null, unit: 'bpm', status: 'no_contact' });
    expect(result.body.meta).toMatchObject({ deviceOnline: true, stale: true });
    expect(result.body.meta.ageMs).toBeGreaterThan(10_000);
    expect((await agent.get('/api/v1/sessions/session-1/measurements?limit=1')).body)
      .toMatchObject({ data: [{ id: 'measurement-1' }], pagination: { hasMore: false } });
  });

  it('devuelve data:null, ageMs:null y stale:true si la sesión no tiene lecturas', async () => {
    const { login, getLatest } = setup();
    getLatest.mockResolvedValueOnce(null);
    const { agent } = await login(operator);
    const result = await agent.get('/api/v1/sessions/session-1/latest');
    expect(result.status).toBe(200);
    expect(result.body.data).toBeNull();
    expect(result.body.meta).toMatchObject({ ageMs: null, stale: true, deviceOnline: true });
  });

  it('valida filtros y límites y rechaza cursores ajenos a la consulta', async () => {
    const { login, listMeasurements, listDevices } = setup();
    const { agent } = await login(operator);
    expect((await agent.get('/api/v1/sessions?operatorId=other')).status).toBe(400);
    expect((await agent.get('/api/v1/sessions?limit=101')).status).toBe(400);
    expect((await agent.get('/api/v1/devices?limit=0')).status).toBe(400);
    expect((await agent.get('/api/v1/sessions/session-1/measurements?from=2026-10-18T00:00:00Z&to=2026-10-17T00:00:00Z')).status).toBe(400);
    listMeasurements.mockRejectedValueOnce(new PersistenceError('INVALID_CURSOR', 'El cursor no corresponde a esta consulta.'));
    const result = await agent.get('/api/v1/sessions/session-1/measurements?cursor=otro');
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('INVALID_CURSOR');
    const devices = await agent.get('/api/v1/devices');
    expect(devices.status).toBe(200);
    expect(devices.body.data[0]).toEqual(expect.objectContaining({ id: 'device-1', source: 'simulated' }));
    expect(devices.body.data[0]).not.toHaveProperty('secretHash');
    expect(listDevices).toHaveBeenCalled();
  });
});

const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
describe.skipIf(!emulatorEnabled)('Contrato B con Firestore Emulator', () => {
  it('crea, inicia, consulta muestras, finaliza y conserva el historial por HTTP', async () => {
    const projectId = process.env.FIREBASE_PROJECT_ID ?? '';
    if (!projectId.startsWith('demo-')) throw new Error('Las pruebas de integración solo usan proyectos demo-.');
    const firebase = initializeApp({ projectId }, `sessions-api-${randomUUID()}`);
    const db = getFirestore(firebase);
    const deviceId = randomUUID();
    try {
      await db.collection('devices').doc(deviceId).set({
        deviceId, code: 'SIM-TEST', board: 'NodeMCU', source: 'simulated', enabled: true,
        activeSessionId: null, lastSeenAt: null,
      });
      const devices = new DevicesRepository(() => db);
      const patients = new PatientsRepository(() => db);
      const assignments = new AssignmentsRepository(() => db);
      const sessions = new SessionsRepository(() => db);
      const measurements = new MeasurementsRepository(() => db);
      const { login } = setup({ deps: { devices, sessions, measurements }, devices });
      const { agent, csrf } = await login(admin);
      const patient = await patients.create({ code: 'P-001', displayName: 'Alias de prueba' }, admin.uid);
      const assignment = await assignments.create({ patientId: patient.id, deviceId }, admin.uid);

      const created = await agent.post('/api/v1/sessions').set('Origin', origin).set('X-CSRF-Token', csrf)
        .send({ assignmentId: assignment.id });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      expect((await agent.get(`/api/v1/sessions?deviceId=${deviceId}`)).body.data).toEqual([created.body.data]);

      const started = await agent.post(`/api/v1/sessions/${id}/start`).set('Origin', origin).set('X-CSRF-Token', csrf);
      expect(started.status).toBe(200);
      expect(started.body.data.status).toBe('active');
      expect((await agent.post(`/api/v1/sessions/${id}/start`).set('Origin', origin).set('X-CSRF-Token', csrf))
        .body.data.startedAt).toBe(started.body.data.startedAt);

      // Esta prueba del Contrato B escribe mediante el repositorio compartido con el Contrato A.
      await measurements.ingest(deviceId, {
        deviceId, capturedAt: null, sessionId: id, bootId: randomUUID(), sequence: 1, measurements: measurement.measurements,
      });
      const latest = await agent.get(`/api/v1/sessions/${id}/latest`);
      expect(latest.status).toBe(200);
      expect(latest.body.data.measurements.heartRate.value).toBeNull();
      expect(latest.body.meta).toMatchObject({ deviceOnline: true, stale: false });
      expect((await agent.get(`/api/v1/sessions/${id}/measurements?limit=1`)).body.data).toHaveLength(1);

      const finished = await agent.post(`/api/v1/sessions/${id}/finish`).set('Origin', origin).set('X-CSRF-Token', csrf);
      expect(finished.body.data.status).toBe('finished');
      expect((await agent.post(`/api/v1/sessions/${id}/finish`).set('Origin', origin).set('X-CSRF-Token', csrf))
        .body.data.finishedAt).toBe(finished.body.data.finishedAt);
      expect((await agent.get(`/api/v1/sessions/${id}/measurements`)).body.data).toHaveLength(1);
      expect((await devices.getById(deviceId))?.activeSessionId).toBeNull();

      const outsider = await login(other);
      expect((await outsider.agent.get(`/api/v1/sessions/${id}/measurements`)).status).toBe(200);
      expect((await outsider.agent.post(`/api/v1/sessions/${id}/start`)
        .set('Origin', origin).set('X-CSRF-Token', outsider.csrf)).status).toBe(403);
      const administrator = await login(admin);
      expect((await administrator.agent.get(`/api/v1/sessions/${id}`)).status).toBe(200);
    } finally {
      await deleteApp(firebase);
    }
  }, 30000);
});
