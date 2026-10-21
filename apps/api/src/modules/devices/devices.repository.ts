import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { getDb } from '../../config/firebase.js';
import { documentId, pagination, PersistenceError, type PageOptions } from '../../shared/persistence.js';
import { writeAudit } from '../audit/audit.repository.js';
import { z } from 'zod';

export interface DeviceDocument {
  deviceId: string;
  code: string;
  board: string;
  source: 'real' | 'simulated';
  enabled: boolean;
  activeSessionId: string | null;
  lastSeenAt: string | null;
  activeAssignmentId?: string | null;
  hardwareId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class DevicesRepository {
  constructor(private readonly db: () => Firestore = getDb) {}
  async listEnabled(): Promise<DeviceDocument[]> { return (await this.list()).data; }

  async list(options: Pick<PageOptions, 'limit' | 'cursor'> & { enabled?: boolean } = {}) {
    const enabled = z.boolean().default(true).parse(options.enabled);
    const page = pagination(options, { collection: 'devices', enabled, order: 'id:desc' });
    let query = this.db().collection('devices').where('enabled', '==', enabled)
      .orderBy(FieldPath.documentId(), 'desc').limit(page.limit + 1);
    if (page.after) query = query.startAfter(page.after.id);
    const rows = (await query.get()).docs.map((doc) => ({ ...doc.data(), deviceId: doc.id }) as DeviceDocument);
    return page.page(rows, (row) => ({ date: '1970-01-01T00:00:00.000Z', id: row.deviceId }));
  }

  async getById(deviceId: string): Promise<DeviceDocument | null> {
    const doc = await this.db().collection('devices').doc(documentId.parse(deviceId)).get();
    return doc.exists ? { ...doc.data(), deviceId: doc.id } as DeviceDocument : null;
  }

  async create(input: { code: string; source: 'real' | 'simulated'; hardwareId?: string }, actorId: string) {
    const data = z.object({ code: z.string().trim().min(1).max(32), source: z.enum(['real', 'simulated']), hardwareId: z.string().max(128).optional() }).strict().parse(input);
    documentId.parse(actorId);
    const db = this.db();
    const ref = db.collection('devices').doc();
    return db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const device: DeviceDocument = { ...data, deviceId: ref.id, board: data.source === 'simulated' ? 'simulator' : 'NodeMCU ESP8266',
        enabled: true, activeSessionId: null, activeAssignmentId: null, lastSeenAt: null, createdAt: now, updatedAt: now };
      tx.create(ref, device);
      writeAudit(tx, db, { actorId, action: 'device.create', targetType: 'device', targetId: ref.id });
      return device;
    });
  }

  async update(deviceId: string, input: { code?: string; hardwareId?: string; enabled?: boolean }, actorId: string) {
    const changes = z.object({ code: z.string().trim().min(1).max(32), hardwareId: z.string().max(128), enabled: z.boolean() })
      .partial().strict().refine((value) => Object.keys(value).length > 0).parse(input);
    documentId.parse(actorId);
    const db = this.db();
    const ref = db.collection('devices').doc(documentId.parse(deviceId));
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new PersistenceError('DEVICE_NOT_FOUND', 'Dispositivo no encontrado.');
      const device = snapshot.data() as DeviceDocument;
      if (changes.enabled === false && (device.activeAssignmentId || device.activeSessionId)) throw new PersistenceError('ASSIGNMENT_IN_USE', 'Cierre primero asignación/sesión.');
      const update = { ...changes, updatedAt: new Date().toISOString() };
      tx.update(ref, update);
      writeAudit(tx, db, { actorId, action: 'device.update', targetType: 'device', targetId: deviceId });
      return { ...device, ...update };
    });
  }

  async heartbeat(deviceId: string): Promise<string> {
    const db = this.db();
    const ref = db.collection('devices').doc(documentId.parse(deviceId));
    return db.runTransaction(async (tx) => {
      const device = await tx.get(ref);
      if (!device.exists || !device.data()?.enabled) throw new PersistenceError('DEVICE_DISABLED', 'Dispositivo no habilitado.');
      const serverTime = new Date().toISOString();
      tx.update(ref, { lastSeenAt: serverTime });
      return serverTime;
    });
  }
}
