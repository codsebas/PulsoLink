import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getDb } from '../../config/firebase.js';
import { documentId, pagination, PersistenceError, type PageOptions } from '../../shared/persistence.js';
import { writeAudit } from '../audit/audit.repository.js';

export interface PatientDocument {
  id: string; code: string; displayName: string; enabled: boolean;
  createdAt: string; updatedAt: string; activeAssignmentId: string | null;
}
const fields = { code: z.string().trim().min(1).max(32), displayName: z.string().trim().min(1).max(120) };

export class PatientsRepository {
  constructor(private readonly db: () => Firestore = getDb) {}
  async getById(patientId: string): Promise<PatientDocument | null> {
    const doc = await this.db().collection('patients').doc(documentId.parse(patientId)).get();
    return doc.exists ? { ...doc.data(), id: doc.id } as PatientDocument : null;
  }
  async create(input: { code: string; displayName: string }, actorId: string): Promise<PatientDocument> {
    const data = z.object(fields).strict().parse(input);
    documentId.parse(actorId);
    const db = this.db();
    const ref = db.collection('patients').doc();
    return db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const patient: PatientDocument = { ...data, id: ref.id, enabled: true, createdAt: now, updatedAt: now, activeAssignmentId: null };
      tx.create(ref, patient);
      writeAudit(tx, db, { actorId, action: 'patient.create', targetType: 'patient', targetId: ref.id });
      return patient;
    });
  }
  async update(patientId: string, input: { code?: string; displayName?: string; enabled?: boolean }, actorId: string) {
    const changes = z.object({ ...fields, enabled: z.boolean() }).partial().strict().refine((value) => Object.keys(value).length > 0).parse(input);
    documentId.parse(actorId);
    const db = this.db();
    const ref = db.collection('patients').doc(documentId.parse(patientId));
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new PersistenceError('PATIENT_NOT_FOUND', 'Paciente no encontrado.');
      const patient = snapshot.data() as PatientDocument;
      if (changes.enabled === false && patient.activeAssignmentId) throw new PersistenceError('ASSIGNMENT_IN_USE', 'Cierre primero la asignación.');
      const update = { ...changes, updatedAt: new Date().toISOString() };
      tx.update(ref, update);
      writeAudit(tx, db, { actorId, action: 'patient.update', targetType: 'patient', targetId: patientId });
      return { ...patient, ...update };
    });
  }
  async list(options: Pick<PageOptions, 'limit' | 'cursor'> & { enabled?: boolean } = {}) {
    const enabled = z.boolean().default(true).parse(options.enabled);
    const page = pagination(options, { collection: 'patients', enabled, order: 'createdAt:desc,id:desc' });
    let query = this.db().collection('patients').where('enabled', '==', enabled)
      .orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(page.limit + 1);
    if (page.after) query = query.startAfter(page.after.date, page.after.id);
    const rows = (await query.get()).docs.map((doc) => ({ ...doc.data(), id: doc.id }) as PatientDocument);
    return page.page(rows, (row) => ({ date: row.createdAt, id: row.id }));
  }
}
