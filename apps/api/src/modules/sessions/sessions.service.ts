import { AppError } from '../../middleware/error-handler.js';
import { canAccessSession } from '../auth/session-access.js';
import type { AuthUser } from '../auth/auth.types.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import { MeasurementsRepository, type StoredMeasurement } from '../measurements/measurements.repository.js';
import { SessionsRepository, type SessionDocument, type SessionListOptions } from './sessions.repository.js';
import type { PageOptions } from '../../shared/persistence.js';

export interface SessionsDependencies {
  sessions: Pick<SessionsRepository, 'create' | 'getById' | 'start' | 'finish' | 'list'>;
  measurements: Pick<MeasurementsRepository, 'getLatest' | 'list'>;
  devices: Pick<DevicesRepository, 'getById'>;
}

export const sessionDependencies = (): SessionsDependencies => ({
  sessions: new SessionsRepository(),
  measurements: new MeasurementsRepository(),
  devices: new DevicesRepository(),
});

export function sessionDto(session: SessionDocument) {
  const { sessionId, participantCode, operatorId, deviceId, source, status, createdAt, startedAt, finishedAt } = session;
  if (session.patientId && session.assignmentId) return { id: sessionId, patientId: session.patientId, assignmentId: session.assignmentId,
    deviceId, source, status, createdAt, startedAt, finishedAt, latestMeasurement: session.latestMeasurement };
  return { id: sessionId, participantCode, operatorId, deviceId, source, status, createdAt, startedAt, finishedAt };
}

export function measurementDto(measurement: StoredMeasurement) {
  const { id, sessionId, deviceId, source, bootId, sequence, capturedAt, receivedAt, measurements } = measurement;
  return { id, sessionId, deviceId, source, bootId, sequence, capturedAt, receivedAt, measurements,
    ...(measurement.patientId && measurement.assignmentId ? { patientId: measurement.patientId, assignmentId: measurement.assignmentId } : {}) };
}

export class SessionsService {
  constructor(private readonly deps: SessionsDependencies = sessionDependencies()) {}

  private async authorized(sessionId: string, user: AuthUser): Promise<SessionDocument> {
    const session = await this.deps.sessions.getById(sessionId);
    if (!session || !canAccessSession(user, session)) {
      throw new AppError('SESSION_NOT_FOUND', 'Sesión no encontrada.', 404);
    }
    return session;
  }

  async create(input: { participantCode: string; deviceId: string }, user: AuthUser) {
    if (user.role === 'viewer') throw new AppError('FORBIDDEN', 'El rol viewer solo puede consultar.', 403);
    return sessionDto(await this.deps.sessions.create({ ...input, operatorId: user.id }));
  }

  async list(options: Omit<SessionListOptions, 'operatorId'>, user: AuthUser) {
    const page = await this.deps.sessions.list({ ...options, ...(user.role === 'operator' ? { operatorId: user.id } : {}) });
    return { data: page.data.map(sessionDto), pagination: page.pagination };
  }

  async get(sessionId: string, user: AuthUser) {
    return sessionDto(await this.authorized(sessionId, user));
  }

  async transition(sessionId: string, user: AuthUser, target: 'active' | 'finished') {
    if (user.role === 'viewer') throw new AppError('FORBIDDEN', 'El rol viewer solo puede consultar.', 403);
    await this.authorized(sessionId, user);
    return sessionDto(await (target === 'active' ? this.deps.sessions.start(sessionId, user.id) : this.deps.sessions.finish(sessionId, user.id)));
  }

  async latest(sessionId: string, user: AuthUser) {
    const session = await this.authorized(sessionId, user);
    const [measurement, device] = await Promise.all([
      this.deps.measurements.getLatest(sessionId),
      this.deps.devices.getById(session.deviceId),
    ]);
    const now = Date.now();
    const ageMs = measurement ? Math.max(0, now - Date.parse(measurement.receivedAt)) : null;
    const lastSeenAt = device?.lastSeenAt ?? null;
    return {
      data: measurement ? measurementDto(measurement) : null,
      meta: {
        serverTime: new Date(now).toISOString(),
        lastSeenAt,
        deviceOnline: lastSeenAt !== null && now - Date.parse(lastSeenAt) <= 45_000,
        ageMs,
        stale: ageMs === null || ageMs > 10_000,
      },
    };
  }

  async measurements(sessionId: string, user: AuthUser, options: PageOptions) {
    await this.authorized(sessionId, user);
    const page = await this.deps.measurements.list(sessionId, options);
    return { data: page.data.map(measurementDto), pagination: page.pagination };
  }
}
