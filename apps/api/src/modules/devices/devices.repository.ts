import { getDb } from '../../config/firebase.js';

export interface DeviceDocument {
  deviceId: string;
  board: string;
  source: 'real' | 'simulated';
  enabled: boolean;
  activeSessionId: string | null;
  lastSeenAt: string | null;
}

export class DevicesRepository {
  private collection() {
    return getDb().collection('devices');
  }

  async listEnabled(): Promise<DeviceDocument[]> {
    const snapshot = await this.collection().where('enabled', '==', true).get();
    return snapshot.docs.map((doc) => doc.data() as DeviceDocument);
  }

  async getById(deviceId: string): Promise<DeviceDocument | null> {
    const doc = await this.collection().doc(deviceId).get();
    if (!doc.exists) return null;
    return doc.data() as DeviceDocument;
  }
}
