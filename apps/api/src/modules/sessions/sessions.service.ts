import { AppError } from '../../middleware/error-handler.js';
import { canAccessSession } from '../auth/session-access.js';
import type { AuthUser } from '../auth/auth.types.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import { MeasurementsRepository, type StoredMeasurement } from '../measurements/measurements.repository.js';
import { SessionsRepository, type SessionDocument, type SessionListOptions } from './sessions.repository.js';
import type { PageOptions } from '../../shared/persistence.js';
import { monitoringMeta } from '../patients/patient-monitoring.service.js';

export interface SessionsDependencies {
  sessions: Pick<SessionsRepository, 'createForAssignment' | 'getById' | 'start' | 'finish' | 'list'>;
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

  private assertAdmin(user: AuthUser) {
    if (user.role !== 'admin') throw new AppError('FORBIDDEN', 'Se requiere rol admin para esta operación.', 403);
  }

  async create(input: { assignmentId: string }, user: AuthUser) {
    this.assertAdmin(user);
    return sessionDto(await this.deps.sessions.createForAssignment(input.assignmentId, user.id));
  }

  async list(options: Omit<SessionListOptions, 'operatorId'>, _user: AuthUser) {
    const page = await this.deps.sessions.list(options);
    return { data: page.data.map(sessionDto), pagination: page.pagination };
  }

  async get(sessionId: string, user: AuthUser) {
    return sessionDto(await this.authorized(sessionId, user));
  }

  async transition(sessionId: string, user: AuthUser, target: 'active' | 'finished') {
    this.assertAdmin(user);
    await this.authorized(sessionId, user);
    return sessionDto(await (target === 'active' ? this.deps.sessions.start(sessionId, user.id) : this.deps.sessions.finish(sessionId, user.id)));
  }

  async latest(sessionId: string, user: AuthUser) {
    const session = await this.authorized(sessionId, user);
    const [measurement, device] = await Promise.all([
      this.deps.measurements.getLatest(sessionId),
      this.deps.devices.getById(session.deviceId),
    ]);
    const lastSeenAt = device?.lastSeenAt ?? null;
    return {
      data: measurement ? measurementDto(measurement) : null,
      meta: monitoringMeta(measurement, lastSeenAt),
    };
  }

  async measurements(sessionId: string, user: AuthUser, options: PageOptions) {
    await this.authorized(sessionId, user);
    const page = await this.deps.measurements.list(sessionId, options);
    return { data: page.data.map(measurementDto), pagination: page.pagination };
  }
}
