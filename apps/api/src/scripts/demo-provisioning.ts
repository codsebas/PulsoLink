import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { documentId, PersistenceError } from '../shared/persistence.js';
import { hashDeviceSecret } from '../modules/devices/device-credentials.repository.js';
import type { UserDocument } from '../modules/users/users.repository.js';
import type { DeviceDocument } from '../modules/devices/devices.repository.js';
import type { DeviceCredentialDocument } from '../modules/devices/device-credentials.repository.js';

export const demoConfigSchema = z.object({
  profiles: z.array(z.object({ uid: documentId, displayName: z.string().trim().min(1).max(100), role: z.enum(['admin', 'operator']) }).strict()).min(1).max(20)
    .refine((profiles) => new Set(profiles.map((profile) => profile.uid)).size === profiles.length, 'UID repetido'),
  deviceId: documentId,
  credentialId: documentId.refine((id) => !id.includes('.'), 'ID de credencial inválido'),
  // Generate 32 random bytes, encoded as base64url; never use a human password.
  secret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
}).strict();
export type DemoConfig = z.infer<typeof demoConfigSchema>;

export async function provisionDemo(db: Firestore, auth: Pick<Auth, 'getUser'>, input: DemoConfig) {
  const config = demoConfigSchema.parse(input);
  for (const profile of config.profiles) {
    const identity = await auth.getUser(profile.uid);
    if (identity.disabled) throw new PersistenceError('AUTH_USER_DISABLED', 'Una identidad de demostración está deshabilitada.');
  }
  const profileRefs = config.profiles.map((profile) => db.collection('users').doc(profile.uid));
  const deviceRef = db.collection('devices').doc(config.deviceId);
  const credentialRef = db.collection('deviceCredentials').doc(config.credentialId);
  const secretHash = hashDeviceSecret(config.secret);
  return db.runTransaction(async (tx) => {
    const [device, credential, ...profiles] = await tx.getAll(deviceRef, credentialRef, ...profileRefs);
    if (device.exists && device.data()?.source !== 'simulated') {
      throw new PersistenceError('PROVISIONING_CONFLICT', 'El dispositivo existente no es simulado.');
    }
    if (credential.exists && (credential.data()?.deviceId !== config.deviceId || credential.data()?.secretHash !== secretHash)) {
      throw new PersistenceError('PROVISIONING_CONFLICT', 'La credencial existente no coincide; no se modificó ningún dato.');
    }
    const createdAt = new Date().toISOString();
    let profilesCreated = 0;
    config.profiles.forEach((profile, index) => {
      if (!profiles[index].exists) {
        const document: UserDocument = { ...profile, enabled: true, createdAt };
        tx.create(profileRefs[index], document);
        profilesCreated++;
      }
    });
    if (!device.exists) {
      const document: DeviceDocument = { deviceId: config.deviceId, code: config.deviceId, board: 'simulator',
        source: 'simulated', enabled: true, activeSessionId: null, lastSeenAt: null };
      tx.create(deviceRef, document);
    }
    if (!credential.exists) {
      const document: DeviceCredentialDocument = { deviceId: config.deviceId, secretHash, enabled: true, createdAt, revokedAt: null };
      tx.create(credentialRef, document);
    }
    return { profilesCreated, deviceCreated: !device.exists, credentialCreated: !credential.exists };
  });
}
