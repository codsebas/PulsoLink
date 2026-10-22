import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { documentId, PersistenceError } from '../shared/persistence.js';
import { hashDeviceSecret } from '../modules/devices/device-credentials.repository.js';
import { writeAudit } from '../modules/audit/audit.repository.js';

export const physicalDeviceSchema = z.object({
  deviceId: documentId,
  credentialId: documentId.refine(id => !id.includes('.'), 'La credencial no puede contener puntos.'),
  code: z.string().trim().min(1).max(32),
  hardwareId: z.string().trim().min(1).max(128).optional(),
  secret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  actorId: documentId,
}).strict();
export type PhysicalDeviceConfig = z.infer<typeof physicalDeviceSchema>;

/** Admin SDK only. Does not assign a patient, start a session, or rotate keys. */
export async function provisionPhysicalDevice(db: Firestore, auth: Pick<Auth, 'getUser'>,
  input: PhysicalDeviceConfig, apply = false) {
  const config = physicalDeviceSchema.parse(input);
  const identity = await auth.getUser(config.actorId);
  if (identity.disabled) throw new PersistenceError('PROVISIONING_FORBIDDEN', 'Identidad administrativa deshabilitada.');
  const deviceRef = db.collection('devices').doc(config.deviceId);
  const credentialRef = db.collection('deviceCredentials').doc(config.credentialId);
  const actorRef = db.collection('users').doc(config.actorId);
  const secretHash = hashDeviceSecret(config.secret);
  return db.runTransaction(async tx => {
    const [device, credential, actor] = await tx.getAll(deviceRef, credentialRef, actorRef);
    const linked = await tx.get(db.collection('deviceCredentials').where('deviceId', '==', config.deviceId).limit(2));
    if (!actor.exists || actor.data()?.role !== 'admin' || actor.data()?.enabled !== true) {
      throw new PersistenceError('PROVISIONING_FORBIDDEN', 'Se requiere un perfil administrativo vigente.');
    }
    const stored = device.data();
    if (device.exists && (stored?.source !== 'real' || stored?.enabled !== true || stored?.code !== config.code ||
      stored?.board !== 'NodeMCU ESP8266' || (config.hardwareId !== undefined && stored?.hardwareId !== config.hardwareId))) {
      throw new PersistenceError('PROVISIONING_CONFLICT', 'La placa existente no coincide o no está habilitada.');
    }
    const saved = credential.data();
    if (credential.exists && !device.exists) {
      throw new PersistenceError('PROVISIONING_CONFLICT', 'La credencial apunta a una placa ausente; requiere revisión.');
    }
    if (credential.exists && (saved?.deviceId !== config.deviceId || saved?.secretHash !== secretHash ||
      saved?.enabled !== true || saved?.revokedAt)) {
      throw new PersistenceError('PROVISIONING_CONFLICT', 'La credencial existente no coincide o está revocada.');
    }
    if (linked.docs.some(doc => doc.id !== config.credentialId) ||
      (!credential.exists && (stored?.activeSessionId || stored?.activeAssignmentId))) {
      throw new PersistenceError('PROVISIONING_CONFLICT', 'La placa tiene otra credencial o está en uso; no se rota automáticamente.');
    }
    const result = { deviceId: config.deviceId, credentialId: config.credentialId,
      deviceCreated: !device.exists, credentialCreated: !credential.exists, applied: apply };
    if (!apply) return result;
    const now = new Date().toISOString();
    if (!device.exists) tx.create(deviceRef, {
      deviceId: config.deviceId, code: config.code, board: 'NodeMCU ESP8266', source: 'real', enabled: true,
      ...(config.hardwareId !== undefined ? { hardwareId: config.hardwareId } : {}),
      activeSessionId: null, activeAssignmentId: null, lastSeenAt: null, createdAt: now, updatedAt: now,
    });
    if (!credential.exists) tx.create(credentialRef, {
      deviceId: config.deviceId, secretHash, enabled: true, revokedAt: null, createdAt: now,
    });
    if (!device.exists || !credential.exists) writeAudit(tx, db, {
      actorId: config.actorId, action: device.exists ? 'device.update' : 'device.create',
      targetType: 'device', targetId: config.deviceId,
    });
    return result;
  });
}
