import { afterAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes, randomUUID } from 'node:crypto';
import { seedEmulators } from '../src/scripts/emulator-fixtures.js';
import { seedPatientDataset } from '../src/scripts/patient-fixtures.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
describe.skipIf(!enabled)('PL2 emulator fixtures', () => {
  const app = enabled ? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }, `fixtures-${randomUUID()}`) : undefined;
  afterAll(async () => { if (app) await deleteApp(app); });
  it('creates admin/viewer once without changing passwords, disabled profiles or device secrets', async () => {
    const db = getFirestore(app!);
    const auth = getAuth(app!);
    const password = randomBytes(24).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    expect(await seedEmulators(db, auth, { password, secret })).toEqual({ profilesCreated: 2, deviceCreated: true, credentialCreated: true });
    const viewer = db.collection('users').doc('demo-viewer');
    expect((await viewer.get()).data()?.role).toBe('viewer');
    expect(await seedPatientDataset(db)).toEqual({ datasetCreated: true });
    const firstSnapshot = (await db.collection('sessions').doc('demo-session-1').get()).data();
    expect(await seedPatientDataset(db)).toEqual({ datasetCreated: false });
    expect((await db.collection('sessions').doc('demo-session-1').get()).data()).toEqual(firstSnapshot);
    await viewer.update({ enabled: false });
    const identity = await auth.getUser('demo-viewer');
    expect(await seedEmulators(db, auth, { password: randomBytes(24).toString('base64url'), secret })).toEqual({ profilesCreated: 0, deviceCreated: false, credentialCreated: false });
    expect((await auth.getUser('demo-viewer')).metadata).toEqual(identity.metadata);
    expect((await viewer.get()).data()?.enabled).toBe(false);
    await expect(seedEmulators(db, auth, { password, secret: randomBytes(32).toString('base64url') })).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    const signIn = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo-viewer@example.invalid', password, returnSecureToken: true }),
    });
    expect(signIn.status).toBe(200);
  }, 30000);
});
