import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { getDb } from '../../config/firebase.js';
import { documentId, pagination, PersistenceError, type PageOptions } from '../../shared/persistence.js';

export interface DeviceDocument {
  deviceId: string;
  code: string;
  board: string;
  source: 'real' | 'simulated';
  enabled: boolean;
  activeSessionId: string | null;
  lastSeenAt: string | null;
}

export class DevicesRepository {
  constructor(private readonly db: () => Firestore = getDb) {}
  async listEnabled(): Promise<DeviceDocument[]> { return (await this.list()).data; }

  async list(options: Pick<PageOptions, 'limit' | 'cursor'> = {}) {
    const page = pagination(options, { collection: 'devices', enabled: true, order: 'id:desc' });
    let query = this.db().collection('devices').where('enabled', '==', true)
      .orderBy(FieldPath.documentId(), 'desc').limit(page.limit + 1);
    if (page.after) query = query.startAfter(page.after.id);
    const rows = (await query.get()).docs.map((doc) => ({ ...doc.data(), deviceId: doc.id }) as DeviceDocument);
    return page.page(rows, (row) => ({ date: '1970-01-01T00:00:00.000Z', id: row.deviceId }));
  }

  async getById(deviceId: string): Promise<DeviceDocument | null> {
    const doc = await this.db().collection('devices').doc(documentId.parse(deviceId)).get();
    return doc.exists ? { ...doc.data(), deviceId: doc.id } as DeviceDocument : null;
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
