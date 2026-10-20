import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { provisionDemo } from './demo-provisioning.js';

export const fixtureConfigSchema = z.object({
  password: z.string().min(12).max(128), secret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});

export function assertDisposableEmulators(environment: NodeJS.ProcessEnv = process.env): void {
  const localHost = /^(127\.0\.0\.1|localhost):\d+$/;
  if (!environment.FIREBASE_PROJECT_ID?.startsWith('demo-') || environment.NODE_ENV === 'production' ||
    !localHost.test(environment.FIRESTORE_EMULATOR_HOST ?? '') || !localHost.test(environment.FIREBASE_AUTH_EMULATOR_HOST ?? '')) {
    throw new Error('Se requieren ambos emuladores locales y un proyecto demo-.');
  }
}

export async function seedEmulators(db: Firestore, auth: Auth, input: z.infer<typeof fixtureConfigSchema>) {
  assertDisposableEmulators();
  const config = fixtureConfigSchema.parse(input);
  const profiles = [
    { uid: 'demo-admin', displayName: 'Administración demo', role: 'admin' as const },
    { uid: 'demo-viewer', displayName: 'Consulta demo', role: 'viewer' as const },
  ];
  // Existing identities are never re-enabled or given a new password on reruns.
  for (const profile of profiles) {
    const email = `${profile.uid}@example.invalid`;
    let existing: UserRecord | undefined;
    try { existing = await auth.getUser(profile.uid); }
    catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
    if (existing) {
      if (existing.email !== email || existing.disabled) throw new Error('Identidad existente incompatible.');
    } else {
      await auth.createUser({ uid: profile.uid, email, displayName: profile.displayName, password: config.password });
    }
  }
  // Auth and Firestore have no shared transaction. If this fails, rerun with the
  // same inputs: Auth identities are retained, Firestore writes are all-or-nothing.
  return provisionDemo(db, auth, { profiles, deviceId: 'demo-device-1', credentialId: 'demo-credential-1', secret: config.secret });
}
