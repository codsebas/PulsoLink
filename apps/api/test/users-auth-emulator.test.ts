import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { getAuth, getDb } from '../src/config/firebase.js';
import { FirebaseIdentityProvider } from '../src/modules/auth/adapters/firebase-identity-provider.js';
import { UsersRepository } from '../src/modules/users/users.repository.js';
import { UsersService } from '../src/modules/users/users.service.js';
import { createAuthMiddleware } from '../src/modules/auth/auth.middleware.js';
import { UsersRepositoryAdapter } from '../src/modules/auth/adapters/users-repository-adapter.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);

describe.skipIf(!enabled)('UsersService con Firebase Auth Emulator real', () => {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
  if (enabled && !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) throw new Error('Solo proyecto demo-.');
  const db = enabled ? getDb() : undefined!;
  const auth = enabled ? getAuth() : undefined!;
  const provider = new FirebaseIdentityProvider({ apiKey: 'emulator', emulatorHost: authHost });
  const service = new UsersService({
    users: new UsersRepository(() => db),
    identity: provider,
  });
  const actor = `admin-auth-${randomUUID()}`;
  const createdUids: string[] = [];

  async function signIn(email: string, password: string): Promise<string> {
    const response = await fetch(
      `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { idToken?: string };
    expect(body.idToken).toEqual(expect.any(String));
    return body.idToken!;
  }

  it('sincroniza rol y deshabilitación reales en Auth', async () => {
    const email = `auth-real-${randomUUID()}@test.local`;
    const password = 'Password123';
    const created = await service.create({
      email,
      password,
      displayName: 'Auth Real',
      role: 'viewer',
    }, actor);
    createdUids.push(created.id);

    const idToken = await signIn(email, password);
    const cookie = await provider.createSessionCookie(idToken, 60 * 60 * 1000);
    await expect(provider.verifySessionCookie(cookie)).resolves.toEqual({ uid: created.id });
    // Avoid issuing and revoking within the same second. Characterize the
    // emulator separately from disabling the identity (which also rejects cookies).
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const updated = await service.update(
      created.id,
      { displayName: 'Auth Actualizado', role: 'admin' },
      actor,
    );
    expect(updated).toMatchObject({ displayName: 'Auth Actualizado', role: 'admin' });
    const authUser = await auth.getUser(created.id);
    expect(authUser.displayName).toBe('Auth Actualizado');
    expect(authUser.customClaims).toMatchObject({ role: 'admin' });
    await expect(provider.verifySessionCookie(cookie)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    console.info('[P-06 Auth Emulator] cookieRejectedAfterRevocation=true; disabled=false; delayMs=1200');

    const disabled = await service.update(created.id, { enabled: false }, actor);
    expect(disabled.enabled).toBe(false);
    expect((await auth.getUser(created.id)).disabled).toBe(true);
    expect((await db.collection('users').doc(created.id).get()).data()).toMatchObject({
      enabled: false,
      pendingOperationId: null,
    });

    const login = await fetch(
      `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    expect(login.status).toBe(400);
    const loginError = (await login.json()) as { error?: { message?: string } };
    expect(loginError.error?.message).toContain('USER_DISABLED');
    await expect(provider.verifySessionCookie(cookie)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  }, 30000);

  it('aplica rol y deshabilitación en la misma cookie antes de sincronizar Auth', async () => {
    const email = `access-${randomUUID()}@test.local`;
    const created = await service.create({ email, password: 'Password123', displayName: 'Admin', role: 'admin' }, actor);
    createdUids.push(created.id);
    const cookie = await provider.createSessionCookie(await signIn(email, 'Password123'), 3600000);
    const middleware = createAuthMiddleware({ identityProvider: provider,
      userRepository: new UsersRepositoryAdapter(new UsersRepository(() => db)) });
    const app = express();
    app.get('/read', middleware.requireUser, (req, res) => { res.json(req.user); });
    app.post('/admin', middleware.requireUser, middleware.requireRole('admin'), (_req, res) => { res.sendStatus(204); });
    app.use(errorHandler);
    const oldCookie = `pulsolink_session=${cookie}`;
    expect((await request(app).post('/admin').set('Cookie', oldCookie)).status).toBe(204);
    let failUpdate = false;
    const delayed = new UsersService({ users: new UsersRepository(() => db), identity: {
      createIdentity: (input) => provider.createIdentity(input),
      getIdentity: (uid) => provider.getIdentity(uid),
      updateIdentity: async (uid, input) => {
        if (failUpdate) throw new Error('controlled update failure');
        await provider.updateIdentity(uid, input);
      },
      revokeSessions: async () => { throw new Error('controlled revocation failure'); },
    } });
    await expect(delayed.update(created.id, { role: 'viewer' }, actor))
      .rejects.toMatchObject({ code: 'AUTH_SYNC_PENDING', statusCode: 503 });
    expect((await request(app).post('/admin').set('Cookie', oldCookie)).status).toBe(403);
    const read = await request(app).get('/read').set('Cookie', oldCookie);
    expect(read.status).toBe(200);
    expect(read.body.role).toBe('viewer');
    failUpdate = true;
    await expect(delayed.update(created.id, { enabled: false }, actor))
      .rejects.toMatchObject({ code: 'AUTH_SYNC_PENDING', statusCode: 503 });
    const disabled = await request(app).get('/read').set('Cookie', oldCookie);
    expect(disabled.status).toBe(403);
    expect(disabled.body.error.code).toBe('USER_DISABLED');
    await service.recoverPending(100);
    expect((await request(app).get('/read').set('Cookie', oldCookie)).status).toBe(401);
    expect((await auth.getUser(created.id)).disabled).toBe(true);
  }, 30000);

  afterAll(async () => {
    const operations = await db.collection('userOperations').where('actorId', '==', actor).get();
    const audits = await db.collection('auditLogs').where('actorId', '==', actor).get();
    const batch = db.batch();
    for (const uid of createdUids) {
      batch.delete(db.collection('users').doc(uid));
      await auth.deleteUser(uid).catch(() => undefined);
    }
    for (const row of operations.docs) batch.delete(row.ref);
    for (const row of audits.docs) batch.delete(row.ref);
    await batch.commit();
  });
});
