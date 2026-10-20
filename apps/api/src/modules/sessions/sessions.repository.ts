import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getDb } from '../../config/firebase.js';
import { documentId, pagination, PersistenceError, type PageOptions } from '../../shared/persistence.js';
import type { StoredMeasurement } from '../measurements/measurements.repository.js';
import type { DeviceDocument } from '../devices/devices.repository.js';
import type { AssignmentDocument } from '../assignments/assignments.repository.js';
import type { PatientDocument } from '../patients/patients.repository.js';
import { writeAudit } from '../audit/audit.repository.js';

export interface SessionDocument {
  sessionId: string;
  participantCode?: string;
  patientId?: string;
  assignmentId?: string;
  operatorId: string;
  deviceId: string;
  source: 'real' | 'simulated';
  status: 'created' | 'active' | 'finished';
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  latestMeasurement: StoredMeasurement | null;
}
export interface SessionListOptions extends PageOptions {
  operatorId?: string; status?: SessionDocument['status']; deviceId?: string; patientId?: string; assignmentId?: string;
}

export class SessionsRepository {
  constructor(private readonly db: () => Firestore = getDb) {}
  async getById(sessionId: string): Promise<SessionDocument | null> {
    const doc = await this.db().collection('sessions').doc(documentId.parse(sessionId)).get();
    return doc.exists ? { ...doc.data(), sessionId: doc.id } as SessionDocument : null;
  }

  // operatorId must come from the authenticated context, never from a request body.
  async create(input: { participantCode: string; operatorId: string; deviceId: string }): Promise<SessionDocument> {
    const data = z.object({ participantCode: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/), operatorId: documentId, deviceId: documentId }).strict().parse(input);
    const db = this.db();
    const ref = db.collection('sessions').doc();
    return db.runTransaction(async (tx) => {
      const device = await tx.get(db.collection('devices').doc(data.deviceId));
      if (!device.exists || !device.data()?.enabled) throw new PersistenceError('DEVICE_DISABLED', 'Dispositivo no habilitado.');
      if (device.data()?.activeAssignmentId) throw new PersistenceError('ASSIGNMENT_CONFLICT', 'Use la asignación activa para crear la sesión.');
      const session: SessionDocument = { ...data, sessionId: ref.id, source: (device.data() as DeviceDocument).source,
        status: 'created', createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, latestMeasurement: null };
      tx.create(ref, session);
      return session;
    });
  }

  async createForAssignment(assignmentId: string, actorId: string): Promise<SessionDocument> {
    documentId.parse(actorId);
    const db = this.db();
    const assignmentRef = db.collection('assignments').doc(documentId.parse(assignmentId));
    const ref = db.collection('sessions').doc();
    return db.runTransaction(async (tx) => {
      const assignment = (await tx.get(assignmentRef)).data() as AssignmentDocument | undefined;
      if (!assignment || assignment.endedAt) throw new PersistenceError('ASSIGNMENT_NOT_ACTIVE', 'Asignación no activa.');
      const [p, d] = await tx.getAll(db.collection('patients').doc(assignment.patientId), db.collection('devices').doc(assignment.deviceId));
      const patient = p.data() as PatientDocument | undefined;
      const device = d.data() as DeviceDocument | undefined;
      if (!patient?.enabled || !device?.enabled) throw new PersistenceError('RESOURCE_DISABLED', 'Paciente o placa deshabilitados.');
      if (patient.activeAssignmentId !== assignmentId || device.activeAssignmentId !== assignmentId) throw new PersistenceError('ASSIGNMENT_CONFLICT', 'Reservas inconsistentes.');
      if (assignment.openSessionId || device.activeSessionId) throw new PersistenceError('ASSIGNMENT_IN_USE', 'Ya existe una sesión abierta.');
      const session: SessionDocument = { sessionId: ref.id, patientId: assignment.patientId, assignmentId,
        deviceId: assignment.deviceId, operatorId: actorId, source: device.source, status: 'created',
        createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, latestMeasurement: null };
      tx.create(ref, session);
      tx.update(assignmentRef, { openSessionId: ref.id });
      writeAudit(tx, db, { actorId, action: 'session.create', targetType: 'session', targetId: ref.id });
      return session;
    });
  }

  async start(sessionId: string, actorId?: string): Promise<SessionDocument> { return this.transition(sessionId, 'active', actorId); }
  async finish(sessionId: string, actorId?: string): Promise<SessionDocument> { return this.transition(sessionId, 'finished', actorId); }

  private async transition(sessionId: string, target: 'active' | 'finished', actorId?: string): Promise<SessionDocument> {
    if (actorId) documentId.parse(actorId);
    const db = this.db();
    const sessionRef = db.collection('sessions').doc(documentId.parse(sessionId));
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(sessionRef);
      if (!snapshot.exists) throw new PersistenceError('SESSION_NOT_FOUND', 'Sesión no encontrada.');
      const session = snapshot.data() as SessionDocument;
      if (session.status === target) return session;
      if ((target === 'active' && session.status !== 'created') || (target === 'finished' && session.status !== 'active')) {
        throw new PersistenceError('INVALID_SESSION_STATE', 'La transición de sesión no está permitida.');
      }
      const deviceRef = db.collection('devices').doc(session.deviceId);
      const device = (await tx.get(deviceRef)).data() as DeviceDocument | undefined;
      if (!device) throw new PersistenceError('DEVICE_NOT_FOUND', 'Dispositivo no encontrado.');
      let assignmentRef;
      if (session.assignmentId && session.patientId) {
        if (!actorId) throw new PersistenceError('ACTOR_REQUIRED', 'Se requiere el actor autenticado de la operación.');
        assignmentRef = db.collection('assignments').doc(session.assignmentId);
        const [a, p] = await tx.getAll(assignmentRef, db.collection('patients').doc(session.patientId));
        const assignment = a.data() as AssignmentDocument | undefined;
        if (!assignment || assignment.endedAt || assignment.patientId !== session.patientId || assignment.deviceId !== session.deviceId ||
          assignment.openSessionId !== sessionId || p.data()?.activeAssignmentId !== session.assignmentId || device.activeAssignmentId !== session.assignmentId) {
          throw new PersistenceError('ASSIGNMENT_NOT_ACTIVE', 'La sesión no corresponde a una asignación activa.');
        }
        if (target === 'active' && !p.data()?.enabled) throw new PersistenceError('RESOURCE_DISABLED', 'Paciente deshabilitado.');
      } else if (device.activeAssignmentId) {
        throw new PersistenceError('ASSIGNMENT_CONFLICT', 'La placa ya pertenece al modelo por paciente.');
      }
      if (target === 'active') {
        if (!device.enabled) throw new PersistenceError('DEVICE_DISABLED', 'Dispositivo no habilitado.');
        if (device.activeSessionId) throw new PersistenceError('DEVICE_BUSY', 'El dispositivo ya está reservado.');
        if (device.source !== session.source) throw new PersistenceError('DEVICE_SOURCE_CHANGED', 'Cambió el origen del dispositivo.');
      } else if (device.activeSessionId !== sessionId) {
        throw new PersistenceError('SESSION_NOT_ACTIVE', 'La reserva del dispositivo no corresponde a la sesión.');
      }
      const now = new Date().toISOString();
      const changes = { status: target, ...(target === 'active' ? { startedAt: now } : { finishedAt: now }) };
      tx.update(sessionRef, changes);
      tx.update(deviceRef, { activeSessionId: target === 'active' ? sessionId : null });
      if (assignmentRef && target === 'finished') tx.update(assignmentRef, { openSessionId: null });
      if (assignmentRef) writeAudit(tx, db, { actorId: actorId!, action: target === 'active' ? 'session.start' : 'session.finish', targetType: 'session', targetId: sessionId });
      return { ...session, ...changes };
    });
  }

  // API must supply operatorId for operators; only an authorized admin may omit it.
  async list(options: SessionListOptions = {}) {
    const operatorId = options.operatorId === undefined ? undefined : documentId.parse(options.operatorId);
    const deviceId = options.deviceId === undefined ? undefined : documentId.parse(options.deviceId);
    const status = z.enum(['created', 'active', 'finished']).optional().parse(options.status);
    const patientId = documentId.optional().parse(options.patientId);
    const assignmentId = documentId.optional().parse(options.assignmentId);
    const page = pagination(options, { collection: 'sessions', operatorId: operatorId ?? null,
      deviceId: deviceId ?? null, status: status ?? null, patientId: patientId ?? null, assignmentId: assignmentId ?? null, order: 'createdAt:desc,id:desc' });
    let query: Query = this.db().collection('sessions');
    if (operatorId) query = query.where('operatorId', '==', operatorId);
    if (deviceId) query = query.where('deviceId', '==', deviceId);
    if (status) query = query.where('status', '==', status);
    if (patientId) query = query.where('patientId', '==', patientId);
    if (assignmentId) query = query.where('assignmentId', '==', assignmentId);
    if (page.from) query = query.where('createdAt', '>=', page.from);
    if (page.to) query = query.where('createdAt', '<', page.to);
    query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(page.limit + 1);
    if (page.after) query = query.startAfter(page.after.date, page.after.id);
    const rows = (await query.get()).docs.map((doc) => ({ ...doc.data(), sessionId: doc.id }) as SessionDocument);
    return page.page(rows, (row) => ({ date: row.createdAt, id: row.sessionId }));
  }
}
