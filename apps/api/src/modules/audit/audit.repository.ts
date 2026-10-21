import { createHash } from 'node:crypto';
import { FieldPath, type Firestore, type Transaction, type Query } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getDb } from '../../config/firebase.js';
import { documentId, pagination, PersistenceError, type PageOptions } from '../../shared/persistence.js';

export const auditAction = z.enum(['auth.login', 'patient.view', 'patient.create', 'patient.update', 'device.create', 'device.update',
  'assignment.create', 'assignment.close', 'session.create', 'session.start', 'session.finish', 'user.create', 'user.update']);
export const auditTargetType = z.enum(['auth', 'patient', 'device', 'assignment', 'session', 'user']);
const eventInput = z.object({ actorId: documentId, action: auditAction,
  targetType: auditTargetType, targetId: documentId,
  result: z.enum(['success', 'failure']).default('success'),
  context: z.object({ viewId: z.string().uuid().optional() }).strict().default({}),
}).strict();
export type AuditInput = z.input<typeof eventInput>;
export type AuditDocument = z.output<typeof eventInput> & { id: string; occurredAt: string };

// No update/delete operation is exposed. Administrative writes call this helper
// in their own transaction, so the mutation and its event commit together.
export function writeAudit(tx: Transaction, db: Firestore, input: AuditInput) {
  const ref = db.collection('auditLogs').doc();
  const event: AuditDocument = { ...eventInput.parse(input), id: ref.id, occurredAt: new Date().toISOString() };
  tx.create(ref, event);
  return event;
}

export class AuditRepository {
  constructor(private readonly db: () => Firestore = getDb) {}
  private async appendResult(input: AuditInput, operationId: string) {
    const data = eventInput.parse(input);
    z.string().uuid().parse(operationId);
    const db = this.db();
    const id = createHash('sha256').update(JSON.stringify([data.actorId, data.action, data.targetType, data.targetId, operationId])).digest('hex');
    const ref = db.collection('auditLogs').doc(id);
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists) {
        const existing = snapshot.data() as AuditDocument;
        const { id: _id, occurredAt: _date, ...prior } = existing;
        if (JSON.stringify(eventInput.parse(prior)) !== JSON.stringify(data)) throw new PersistenceError('IDEMPOTENCY_CONFLICT', 'Operación de auditoría conflictiva.');
        return { event: existing, duplicate: true };
      }
      const event: AuditDocument = { ...data, id, occurredAt: new Date().toISOString() };
      tx.create(ref, event);
      return { event, duplicate: false };
    });
  }
  async append(input: AuditInput, operationId: string): Promise<AuditDocument> {
    return (await this.appendResult(input, operationId)).event;
  }
  recordPatientView(actorId: string, patientId: string, viewId: string) {
    return this.append({ actorId, action: 'patient.view', targetType: 'patient', targetId: patientId, context: { viewId } }, viewId);
  }
  async recordPatientAccess(actorId: string, patientId: string, viewId: string) {
    const result = await this.appendResult({ actorId, action: 'patient.view', targetType: 'patient', targetId: patientId, context: { viewId } }, viewId);
    return { eventId: result.event.id, duplicate: result.duplicate };
  }
  // Only authorized admin services may invoke this read.
  async list(options: PageOptions & {
    actorId?: string;
    action?: z.infer<typeof auditAction>;
    targetType?: z.infer<typeof auditTargetType>;
    targetId?: string;
  } = {}) {
    const actorId = documentId.optional().parse(options.actorId);
    const action = auditAction.optional().parse(options.action);
    const targetType = auditTargetType.optional().parse(options.targetType);
    const targetId = documentId.optional().parse(options.targetId);
    const page = pagination(options, {
      collection: 'auditLogs',
      actorId: actorId ?? null,
      action: action ?? null,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      order: 'occurredAt:desc,id:desc',
    });
    let query: Query = this.db().collection('auditLogs');
    if (actorId) query = query.where('actorId', '==', actorId);
    if (action) query = query.where('action', '==', action);
    if (targetType) query = query.where('targetType', '==', targetType);
    if (targetId) query = query.where('targetId', '==', targetId);
    if (page.from) query = query.where('occurredAt', '>=', page.from);
    if (page.to) query = query.where('occurredAt', '<', page.to);
    query = query.orderBy('occurredAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(page.limit + 1);
    if (page.after) query = query.startAfter(page.after.date, page.after.id);
    return page.page((await query.get()).docs.map((doc) => ({ ...doc.data(), id: doc.id }) as AuditDocument), (row) => ({ date: row.occurredAt, id: row.id }));
  }
}
