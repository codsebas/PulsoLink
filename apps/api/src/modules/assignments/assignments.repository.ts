import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getDb } from '../../config/firebase.js';
import { documentId, pagination, PersistenceError, type PageOptions } from '../../shared/persistence.js';
import { writeAudit } from '../audit/audit.repository.js';
import type { PatientDocument } from '../patients/patients.repository.js';
import type { DeviceDocument } from '../devices/devices.repository.js';

export interface AssignmentDocument {
  id: string; patientId: string; deviceId: string; startedAt: string; endedAt: string | null;
  assignedBy: string; endedBy: string | null; openSessionId: string | null; status: 'active' | 'closed';
}
export class AssignmentsRepository {
  constructor(private readonly db: () => Firestore = getDb) {}
  async getById(assignmentId: string): Promise<AssignmentDocument | null> {
    const snapshot = await this.db().collection('assignments').doc(documentId.parse(assignmentId)).get();
    return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } as AssignmentDocument : null;
  }
  async create(input: { patientId: string; deviceId: string }, actorId: string): Promise<AssignmentDocument> {
    const data = z.object({ patientId: documentId, deviceId: documentId }).strict().parse(input);
    documentId.parse(actorId);
    const db = this.db();
    const ref = db.collection('assignments').doc();
    const patientRef = db.collection('patients').doc(data.patientId);
    const deviceRef = db.collection('devices').doc(data.deviceId);
    return db.runTransaction(async (tx) => {
      const [p, d] = await tx.getAll(patientRef, deviceRef);
      const patient = p.data() as PatientDocument | undefined;
      const device = d.data() as DeviceDocument | undefined;
      if (!patient) throw new PersistenceError('PATIENT_NOT_FOUND', 'Paciente no encontrado.');
      if (!device) throw new PersistenceError('DEVICE_NOT_FOUND', 'Dispositivo no encontrado.');
      if (!patient.enabled || !device.enabled) throw new PersistenceError('RESOURCE_DISABLED', 'Paciente o placa deshabilitados.');
      if (patient.activeAssignmentId || device.activeAssignmentId || device.activeSessionId) {
        throw new PersistenceError('ASSIGNMENT_CONFLICT', 'Paciente o placa ya reservados.');
      }
      const assignment: AssignmentDocument = { ...data, id: ref.id, startedAt: new Date().toISOString(),
        endedAt: null, assignedBy: actorId, endedBy: null, openSessionId: null, status: 'active' };
      tx.create(ref, assignment);
      tx.update(patientRef, { activeAssignmentId: ref.id });
      tx.update(deviceRef, { activeAssignmentId: ref.id });
      writeAudit(tx, db, { actorId, action: 'assignment.create', targetType: 'assignment', targetId: ref.id });
      return assignment;
    });
  }
  async close(assignmentId: string, actorId: string): Promise<AssignmentDocument> {
    documentId.parse(actorId);
    const db = this.db();
    const ref = db.collection('assignments').doc(documentId.parse(assignmentId));
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new PersistenceError('ASSIGNMENT_NOT_FOUND', 'Asignación no encontrada.');
      const assignment = snapshot.data() as AssignmentDocument;
      if (assignment.endedAt) return assignment;
      const patientRef = db.collection('patients').doc(assignment.patientId);
      const deviceRef = db.collection('devices').doc(assignment.deviceId);
      const [p, d] = await tx.getAll(patientRef, deviceRef);
      if (assignment.openSessionId || d.data()?.activeSessionId) throw new PersistenceError('ASSIGNMENT_IN_USE', 'Finalice primero la sesión abierta.');
      if (p.data()?.activeAssignmentId !== assignmentId || d.data()?.activeAssignmentId !== assignmentId) {
        throw new PersistenceError('ASSIGNMENT_CONFLICT', 'Reservas inconsistentes.');
      }
      const changes = { endedAt: new Date().toISOString(), endedBy: actorId, status: 'closed' as const };
      tx.update(ref, changes);
      tx.update(patientRef, { activeAssignmentId: null });
      tx.update(deviceRef, { activeAssignmentId: null });
      writeAudit(tx, db, { actorId, action: 'assignment.close', targetType: 'assignment', targetId: assignmentId });
      return { ...assignment, ...changes };
    });
  }
  async list(options: PageOptions & { patientId?: string; deviceId?: string; status?: 'active' | 'closed' } = {}) {
    const patientId = documentId.optional().parse(options.patientId);
    const deviceId = documentId.optional().parse(options.deviceId);
    const status = z.enum(['active', 'closed']).optional().parse(options.status);
    const page = pagination(options, { collection: 'assignments', patientId: patientId ?? null, deviceId: deviceId ?? null,
      status: status ?? null, order: 'startedAt:desc,id:desc' });
    let query: Query = this.db().collection('assignments');
    if (patientId) query = query.where('patientId', '==', patientId);
    if (deviceId) query = query.where('deviceId', '==', deviceId);
    if (status) query = query.where('status', '==', status);
    if (page.from) query = query.where('startedAt', '>=', page.from);
    if (page.to) query = query.where('startedAt', '<', page.to);
    query = query.orderBy('startedAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(page.limit + 1);
    if (page.after) query = query.startAfter(page.after.date, page.after.id);
    return page.page((await query.get()).docs.map((doc) => ({ ...doc.data(), id: doc.id }) as AssignmentDocument), (row) => ({ date: row.startedAt, id: row.id }));
  }
}
