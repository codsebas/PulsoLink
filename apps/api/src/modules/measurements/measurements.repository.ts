import { createHash } from 'node:crypto';
import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getDb } from '../../config/firebase.js';
import { dateTime, documentId, pagination, PersistenceError, type PageOptions } from '../../shared/persistence.js';
import type { MeasurementsPayload } from '../../shared/types.js';
import type { SessionDocument } from '../sessions/sessions.repository.js';
import type { DeviceDocument } from '../devices/devices.repository.js';
import type { AssignmentDocument } from '../assignments/assignments.repository.js';

export interface StoredMeasurement {
  id: string; sessionId: string; deviceId: string; source: 'real' | 'simulated';
  bootId: string; sequence: number; capturedAt: string | null; receivedAt: string;
  measurements: MeasurementsPayload;
  patientId?: string; assignmentId?: string;
}
export interface IngestInput {
  sessionId: string; bootId: string; sequence: number; capturedAt?: string | null;
  measurements: MeasurementsPayload;
  deviceId?: string;
}
interface IngestionKey { payloadHash: string; measurementId: string; receivedAt: string }

function vital(unit: 'bpm' | '%' | 'C', min: number, max: number, exclusiveMin = false) {
  return z.object({ value: z.number().finite().nullable(), unit: z.literal(unit),
    status: z.enum(['valid', 'no_contact', 'invalid', 'unavailable']),
  }).strict().superRefine((value, ctx) => {
    const valid = value.status === 'valid'
      ? value.value !== null && (exclusiveMin ? value.value > min : value.value >= min) && value.value <= max
      : value.value === null;
    if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Valor incompatible con calidad o límites técnicos.' });
  });
}

export const measurementInputSchema = z.object({
  sessionId: documentId, bootId: z.string().uuid(), sequence: z.number().int().min(0).max(2 ** 32 - 1),
  capturedAt: dateTime.nullable().optional().transform((value) => value ?? null),
  measurements: z.object({ heartRate: vital('bpm', 0, 300, true), spo2: vital('%', 0, 100), skinTemperature: vital('C', -55, 125) }).strict(),
}).strict();
// HTTP keeps its previous validator until #27 switches the device contract.
// Persistence already accepts target payloads and checks identity inside ingest.
export const patientMeasurementInputSchema = measurementInputSchema.extend({ deviceId: documentId, capturedAt: dateTime.nullable() });
const inputSchema = measurementInputSchema.extend({ deviceId: documentId.optional() });
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class MeasurementsRepository {
  constructor(private readonly db: () => Firestore = getDb) {}

  // deviceId comes only from an authenticated credential, not the payload.
  async ingest(deviceId: string, input: IngestInput) {
    documentId.parse(deviceId);
    // Zod reconstructs keys in schema order, independent of JSON property order.
    const { deviceId: declaredDeviceId, ...data } = inputSchema.parse(input);
    if (declaredDeviceId && declaredDeviceId !== deviceId) throw new PersistenceError('DEVICE_ID_MISMATCH', 'La identidad declarada no coincide con la credencial.');
    const payloadHash = hash(data);
    const db = this.db();
    const keyRef = db.collection('ingestionKeys').doc(hash([deviceId, data.bootId, data.sequence]));
    const sessionRef = db.collection('sessions').doc(data.sessionId);
    const deviceRef = db.collection('devices').doc(deviceId);
    const measurementRef = sessionRef.collection('measurements').doc();
    return db.runTransaction(async (tx) => {
      const [keySnapshot, deviceSnapshot] = await tx.getAll(keyRef, deviceRef);
      const device = deviceSnapshot.data() as DeviceDocument | undefined;
      if (!device?.enabled) throw new PersistenceError('DEVICE_DISABLED', 'Dispositivo no habilitado.');
      if (keySnapshot.exists) {
        const key = keySnapshot.data() as IngestionKey;
        if (key.payloadHash !== payloadHash) throw new PersistenceError('IDEMPOTENCY_CONFLICT', 'La clave ya tiene otro contenido.');
        return { measurementId: key.measurementId, receivedAt: key.receivedAt, duplicate: true };
      }
      const sessionSnapshot = await tx.get(sessionRef);
      const session = sessionSnapshot.data() as SessionDocument | undefined;
      if (!session || session.status !== 'active' || session.deviceId !== deviceId || device.activeSessionId !== data.sessionId) {
        throw new PersistenceError('SESSION_NOT_ACTIVE', 'La sesión no está activa para este dispositivo.');
      }
      if (session.source !== device.source) throw new PersistenceError('DEVICE_SOURCE_CHANGED', 'Cambió el origen del dispositivo.');
      if (session.patientId || session.assignmentId) {
        if (!session.patientId || !session.assignmentId) throw new PersistenceError('ASSIGNMENT_NOT_ACTIVE', 'Relación histórica incompleta.');
        if (!declaredDeviceId || !Object.prototype.hasOwnProperty.call(input, 'capturedAt')) {
          throw new PersistenceError('VALIDATION_ERROR', 'Las nuevas sesiones requieren deviceId y capturedAt explícitos.');
        }
        const [a, p] = await tx.getAll(db.collection('assignments').doc(session.assignmentId), db.collection('patients').doc(session.patientId));
        const assignment = a.data() as AssignmentDocument | undefined;
        if (!assignment || assignment.endedAt || assignment.patientId !== session.patientId || assignment.deviceId !== deviceId ||
          assignment.openSessionId !== data.sessionId || p.data()?.activeAssignmentId !== session.assignmentId || device.activeAssignmentId !== session.assignmentId) {
          throw new PersistenceError('ASSIGNMENT_NOT_ACTIVE', 'Asignación no activa o incompatible.');
        }
        if (!p.data()?.enabled) throw new PersistenceError('RESOURCE_DISABLED', 'Paciente deshabilitado.');
      } else if (device.activeAssignmentId) throw new PersistenceError('ASSIGNMENT_NOT_ACTIVE', 'Sesión de legado incompatible con la asignación.');
      const receivedAt = new Date().toISOString();
      const measurement: StoredMeasurement = { ...data, id: measurementRef.id, deviceId, source: session.source, receivedAt };
      if (session.patientId && session.assignmentId) {
        measurement.patientId = session.patientId;
        measurement.assignmentId = session.assignmentId;
      }
      tx.create(measurementRef, measurement);
      tx.create(keyRef, { payloadHash, measurementId: measurement.id, receivedAt });
      // Same ordering as history, including deterministic ties within a millisecond.
      const previous = session.latestMeasurement;
      if (!previous || receivedAt > previous.receivedAt || (receivedAt === previous.receivedAt && measurement.id > previous.id)) {
        tx.update(sessionRef, { latestMeasurement: measurement });
      }
      tx.update(deviceRef, { lastSeenAt: receivedAt });
      return { measurementId: measurement.id, receivedAt, duplicate: false };
    });
  }

  async getLatest(sessionId: string): Promise<StoredMeasurement | null> {
    const page = await this.list(sessionId, { limit: 1 });
    return page.data[0] ?? null;
  }

  async listByPatient(patientId: string, options: PageOptions = {}) {
    documentId.parse(patientId);
    const db = this.db();
    const page = pagination(options, { collection: 'measurements', patientId, order: 'receivedAt:desc,path:desc' }, 'measurement-path');
    let query: Query = db.collectionGroup('measurements').where('patientId', '==', patientId);
    if (page.from) query = query.where('receivedAt', '>=', page.from);
    if (page.to) query = query.where('receivedAt', '<', page.to);
    query = query.orderBy('receivedAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(page.limit + 1);
    if (page.after) query = query.startAfter(page.after.date, db.doc(page.after.id));
    const result = page.page((await query.get()).docs, (doc) => ({ date: doc.get('receivedAt') as string, id: doc.ref.path }));
    return { data: result.data.map((doc) => ({ ...doc.data(), id: doc.id }) as StoredMeasurement), pagination: result.pagination };
  }

  // Services must authorize access to the parent session before calling these reads.
  async list(sessionId: string, options: PageOptions = {}) {
    documentId.parse(sessionId);
    const page = pagination(options, { collection: 'measurements', sessionId, order: 'receivedAt:desc,id:desc' });
    let query: Query = this.db().collection('sessions').doc(sessionId).collection('measurements');
    if (page.from) query = query.where('receivedAt', '>=', page.from);
    if (page.to) query = query.where('receivedAt', '<', page.to);
    query = query.orderBy('receivedAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(page.limit + 1);
    if (page.after) query = query.startAfter(page.after.date, page.after.id);
    const rows = (await query.get()).docs.map((doc) => ({ ...doc.data(), id: doc.id }) as StoredMeasurement);
    return page.page(rows, (row) => ({ date: row.receivedAt, id: row.id }));
  }
}
