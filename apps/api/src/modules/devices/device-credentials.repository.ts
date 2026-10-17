import { createHash, timingSafeEqual } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { getDb } from '../../config/firebase.js';
import { documentId } from '../../shared/persistence.js';
import { DevicesRepository, type DeviceDocument } from './devices.repository.js';

export interface DeviceCredentialDocument {
  deviceId: string; secretHash: string; enabled: boolean; createdAt: string; revokedAt: string | null;
}
// SHA-256 is appropriate here only for randomly generated high-entropy device secrets.
export const hashDeviceSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

export class DeviceCredentialsRepository {
  constructor(private readonly db: () => Firestore = getDb) {}
  async authenticate(bearer: string): Promise<DeviceDocument | null> {
    if (bearer.length > 1024) return null;
    const match = /^([^.]+)\.([A-Za-z0-9_-]{43,})$/.exec(bearer);
    if (!match || !documentId.safeParse(match[1]).success) return null;
    const snapshot = await this.db().collection('deviceCredentials').doc(match[1]).get();
    const credential = snapshot.data() as DeviceCredentialDocument | undefined;
    if (!credential?.enabled || credential.revokedAt || !/^[a-f0-9]{64}$/.test(credential.secretHash)) return null;
    const actual = Buffer.from(hashDeviceSecret(match[2]), 'hex');
    if (!timingSafeEqual(actual, Buffer.from(credential.secretHash, 'hex'))) return null;
    const device = await new DevicesRepository(this.db).getById(credential.deviceId);
    return device?.enabled ? device : null;
  }
}
