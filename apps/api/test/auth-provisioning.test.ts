import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
describe.skipIf(!enabled)('aprovisionamiento CLI de Auth sin cambios destructivos', () => {
  if (enabled && !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) throw new Error('Use emuladores desechables.');
  const app = enabled ? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }, `auth-provision-${randomUUID()}`) : undefined;
  const auth = enabled ? getAuth(app!) : undefined!;
  let adminEmail: string, viewerEmail: string, password: string;
  beforeEach(() => {
    const id = randomUUID(); adminEmail = `admin-${id}@example.invalid`; viewerEmail = `viewer-${id}@example.invalid`;
    password = randomBytes(24).toString('base64url');
  });
  afterAll(async () => { if (app) await deleteApp(app); });
  const run = (overrides: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath,
    [resolve('../../node_modules/tsx/dist/cli.mjs'), 'src/scripts/provision-auth-users.ts'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
      env: { ...process.env, PROVISION_TARGET_PROJECT: process.env.FIREBASE_PROJECT_ID,
        PROVISION_ADMIN_EMAIL: adminEmail, PROVISION_ADMIN_PASSWORD: password, PROVISION_ADMIN_NAME: 'Admin original',
        PROVISION_VIEWER_EMAIL: viewerEmail, PROVISION_VIEWER_PASSWORD: password, PROVISION_VIEWER_NAME: 'Consulta original',
        PROVISION_OPERATOR_EMAIL: '', PROVISION_OPERATOR_PASSWORD: '', PROVISION_OPERATOR_NAME: '', ...overrides },
    });
  const signIn = (email: string, attempt: string) => fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: attempt, returnSecureToken: true }) });

  it('repetir conserva contraseña y nombre aunque los argumentos cambien', async () => {
    const first = run(); expect(first.status).toBe(0);
    expect(first.stdout + first.stderr).not.toContain(password);
    const original = await auth.getUserByEmail(adminEmail);
    const replacement = randomBytes(24).toString('base64url');
    const repeated = run({ PROVISION_ADMIN_PASSWORD: replacement, PROVISION_ADMIN_NAME: 'No debe sobrescribir' });
    expect(repeated.status).toBe(0); expect(repeated.stdout).toContain('conservado');
    expect(repeated.stdout + repeated.stderr).not.toContain(replacement);
    expect((await auth.getUserByEmail(adminEmail)).displayName).toBe('Admin original');
    expect((await auth.getUserByEmail(adminEmail)).uid).toBe(original.uid);
    expect((await signIn(adminEmail, password)).status).toBe(200);
    expect((await signIn(adminEmail, replacement)).status).toBe(400);
  }, 30000);

  it('rechaza una cuenta deshabilitada sin reactivarla ni crear el otro destino', async () => {
    const viewer = await auth.createUser({ email: viewerEmail, password, disabled: true });
    const result = run(); expect(result.status).toBe(1);
    expect((await auth.getUser(viewer.uid)).disabled).toBe(true);
    await expect(auth.getUserByEmail(adminEmail)).rejects.toMatchObject({ code: 'auth/user-not-found' });
    expect(result.stdout + result.stderr).not.toContain(password);
  });

  it('el alias legado crea un perfil sugerido viewer; rechaza aliases contradictorios', async () => {
    const alias = run({ PROVISION_VIEWER_EMAIL: '', PROVISION_VIEWER_PASSWORD: '', PROVISION_VIEWER_NAME: '',
      PROVISION_OPERATOR_EMAIL: viewerEmail, PROVISION_OPERATOR_PASSWORD: password, PROVISION_OPERATOR_NAME: 'Consulta legado' });
    expect(alias.status).toBe(0);
    const output = alias.stdout.split(/\r?\n/).find(line => line.startsWith('DEMO_PROFILES_JSON='))!;
    const profiles = JSON.parse(output.slice('DEMO_PROFILES_JSON='.length));
    expect(profiles.find((p: { role: string }) => p.role === 'viewer')).toBeTruthy();
    expect(profiles.some((p: { role: string }) => p.role === 'operator')).toBe(false);
    const conflict = run({ PROVISION_OPERATOR_EMAIL: 'otra-cuenta@example.invalid' });
    expect(conflict.status).toBe(1); expect(conflict.stdout).not.toContain('DEMO_PROFILES_JSON');
  }, 30000);

  it('falla antes de crear por proyecto distinto o por usar la misma identidad para ambos roles', async () => {
    expect(run({ PROVISION_TARGET_PROJECT: 'otro-proyecto' }).status).toBe(1);
    expect(run({ PROVISION_VIEWER_EMAIL: adminEmail }).status).toBe(1);
    await expect(auth.getUserByEmail(adminEmail)).rejects.toMatchObject({ code: 'auth/user-not-found' });
  });
});
