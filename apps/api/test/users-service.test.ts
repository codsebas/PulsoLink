import { afterAll, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { UsersRepository, userCreateOperationId } from '../src/modules/users/users.repository.js';
import { UsersService } from '../src/modules/users/users.service.js';
import type {
  CreateIdentityInput,
  IdentityProvider,
  IdentityUser,
  UpdateIdentityInput,
  VerifiedCredentials,
} from '../src/modules/auth/auth.types.js';
import { AuthError } from '../src/modules/auth/auth.errors.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

class FakeIdentity implements IdentityProvider {
  readonly identities = new Map<string, IdentityUser & { displayName: string; role?: string }>();
  readonly revoked: string[] = [];
  readonly updates: Array<{ uid: string; input: UpdateIdentityInput }> = [];
  failNextCreate = false;
  failNextUpdate = false;

  async verifyPassword(_email: string, _password: string): Promise<VerifiedCredentials> {
    throw new Error('No usado');
  }

  async createSessionCookie(_idToken: string, _expiresInMs: number): Promise<string> {
    throw new Error('No usado');
  }

  async verifySessionCookie(_cookie: string): Promise<{ uid: string }> {
    throw new Error('No usado');
  }

  async createIdentity(input: CreateIdentityInput): Promise<void> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new AuthError(503, 'AUTH_UNAVAILABLE', 'No disponible');
    }
    const email = input.email.trim().toLowerCase();
    for (const identity of this.identities.values()) {
      if (identity.email === email) {
        throw new AuthError(409, 'USER_CREATE_CONFLICT', 'Correo existente');
      }
    }
    this.identities.set(input.uid, {
      uid: input.uid,
      email,
      disabled: false,
      displayName: input.displayName,
      role: input.role,
    });
  }

  async findIdentityByEmail(email: string): Promise<IdentityUser | null> {
    for (const identity of this.identities.values()) {
      if (identity.email === email.trim().toLowerCase()) return identity;
    }
    return null;
  }

  async getIdentity(uid: string): Promise<IdentityUser | null> {
    return this.identities.get(uid) ?? null;
  }

  async updateIdentity(uid: string, input: UpdateIdentityInput): Promise<void> {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new AuthError(503, 'AUTH_UNAVAILABLE', 'No disponible');
    }
    const identity = this.identities.get(uid);
    if (!identity) throw new AuthError(503, 'AUTH_SYNC_PENDING', 'No disponible');
    this.updates.push({ uid, input });
    this.identities.set(uid, {
      ...identity,
      disabled: input.disabled ?? identity.disabled,
      displayName: input.displayName ?? identity.displayName,
      role: input.role ?? identity.role,
    });
  }

  async revokeSessions(uid: string): Promise<void> {
    this.revoked.push(uid);
  }
}

describe.skipIf(!enabled)('UsersService con Firestore Emulator', () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (enabled && !projectId?.startsWith('demo-')) throw new Error('Solo proyecto demo-.');
  const app = enabled ? initializeApp({ projectId }, `users-service-${randomUUID()}`) : undefined;
  const db = app ? getFirestore(app) : undefined!;
  const users = new UsersRepository(() => db);
  const actor = `admin-${randomUUID()}`;
  const createdUids: string[] = [];

  function service(identity: FakeIdentity) {
    return new UsersService({ users, identity });
  }

  it('crea perfil e identidad, no persiste la contraseña y es idempotente', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const email = `user-${randomUUID()}@test.local`;
    const input = { email, password: 'Password123', displayName: 'Visor', role: 'viewer' as const };
    const created = await usersService.create(input, actor);
    createdUids.push(created.id);
    expect(created).toMatchObject({ displayName: 'Visor', role: 'viewer', enabled: true });
    expect(created).not.toHaveProperty('password');
    const stored = await db.collection('users').doc(created.id).get();
    expect(stored.data()).not.toHaveProperty('password');
    expect(stored.data()).not.toHaveProperty('passwordHash');
    expect(stored.data()).toMatchObject({
      profileVersion: 1,
      pendingOperationId: null,
      authSyncedAt: expect.any(String),
    });
    const operation = await db.collection('userOperations').doc(userCreateOperationId(email)).get();
    expect(operation.data()).toMatchObject({ status: 'completed', email, uid: created.id });

    const retried = await usersService.create(input, actor);
    expect(retried).toEqual(created);
    const rows = await db.collection('users').where('uid', '==', created.id).get();
    expect(rows.docs).toHaveLength(1);
    const audits = await db.collection('auditLogs')
      .where('actorId', '==', actor).where('targetId', '==', created.id).get();
    expect(audits.docs.filter((doc) => doc.data().action === 'user.create')).toHaveLength(1);
  }, 30000);

  it('rechaza correo de otra identidad sin adoptar ni dejar perfil huérfano', async () => {
    const identity = new FakeIdentity();
    const email = `taken-${randomUUID()}@test.local`;
    await identity.createIdentity({
      uid: `other-${randomUUID()}`, email, password: 'Password123', displayName: 'Otro', role: 'viewer',
    });
    const usersService = service(identity);
    await expect(usersService.create({
      email, password: 'Password123', displayName: 'Nuevo', role: 'viewer',
    }, actor)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', statusCode: 409 });
    const operationId = userCreateOperationId(email);
    expect((await db.collection('userOperations').doc(operationId).get()).exists).toBe(false);
  }, 30000);

  it('actualiza versión, deshabilita y revoca sesiones; reintenta una sincronización fallida', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const created = await usersService.create({
      email: `update-${randomUUID()}@test.local`,
      password: 'Password123',
      displayName: 'Visor',
      role: 'viewer',
    }, actor);
    createdUids.push(created.id);

    identity.failNextUpdate = true;
    await expect(usersService.update(created.id, { displayName: 'Admin', role: 'admin' }, actor))
      .rejects.toMatchObject({ code: 'AUTH_SYNC_PENDING', statusCode: 503 });
    expect((await users.getById(created.id))?.pendingOperationId).toEqual(expect.any(String));
    const auditsAfterFailure = await db.collection('auditLogs')
      .where('actorId', '==', actor).where('targetId', '==', created.id)
      .where('action', '==', 'user.update').get();
    expect(auditsAfterFailure.docs).toHaveLength(1);

    const updated = await usersService.update(created.id, { displayName: 'Admin', role: 'admin' }, actor);
    expect(updated).toMatchObject({ id: created.id, displayName: 'Admin', role: 'admin', enabled: true });
    const stored = await users.getById(created.id);
    expect(stored).toMatchObject({ profileVersion: 2, pendingOperationId: null, displayName: 'Admin', role: 'admin' });
    expect(identity.identities.get(created.id)).toMatchObject({ displayName: 'Admin', role: 'admin' });
    expect(identity.revoked).toContain(created.id);
    expect((await db.collection('auditLogs')
      .where('actorId', '==', actor).where('targetId', '==', created.id)
      .where('action', '==', 'user.update').get()).docs).toHaveLength(1);

    const disabled = await usersService.update(created.id, { enabled: false }, actor);
    expect(disabled.enabled).toBe(false);
    expect(identity.identities.get(created.id)?.disabled).toBe(true);
    expect((await users.list({ limit: 100 })).data.map((user) => user.uid)).not.toContain(created.id);
    expect((await users.list({ limit: 100, enabled: false })).data.map((user) => user.uid)).toContain(created.id);
  }, 30000);

  it('permite deshabilitar con una actualización pendiente y reemplaza la operación anterior', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const created = await usersService.create({
      email: `consecutive-${randomUUID()}@test.local`,
      password: 'Password123',
      displayName: 'Inicial',
      role: 'viewer',
    }, actor);
    createdUids.push(created.id);

    identity.failNextUpdate = true;
    await expect(usersService.update(created.id, { displayName: 'Pendiente' }, actor))
      .rejects.toMatchObject({ code: 'AUTH_SYNC_PENDING', statusCode: 503 });
    const oldOperationId = (await users.getById(created.id))?.pendingOperationId;
    expect(oldOperationId).toEqual(expect.any(String));

    const disabled = await usersService.update(created.id, { enabled: false }, actor);
    expect(disabled).toMatchObject({ displayName: 'Pendiente', enabled: false });
    const stored = await users.getById(created.id);
    expect(stored).toMatchObject({ displayName: 'Pendiente', enabled: false, pendingOperationId: null });
    const oldOperation = await db.collection('userOperations').doc(oldOperationId!).get();
    expect(oldOperation.data()).toMatchObject({ status: 'superseded' });
    expect(oldOperation.data()?.supersededBy).toEqual(expect.any(String));
    expect(identity.identities.get(created.id)).toMatchObject({ displayName: 'Pendiente', disabled: true });
    expect((await db.collection('auditLogs')
      .where('actorId', '==', actor).where('targetId', '==', created.id)
      .where('action', '==', 'user.update').get()).docs).toHaveLength(2);

    const updatesBeforeRecovery = identity.updates.filter((row) => row.uid === created.id).length;
    await usersService.recoverPending(100);
    expect(identity.updates.filter((row) => row.uid === created.id)).toHaveLength(updatesBeforeRecovery);
    expect(identity.identities.get(created.id)?.disabled).toBe(true);
  }, 30000);

  it('recupera el perfil actual y no reactiva una operación antigua', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const created = await usersService.create({
      email: `stale-${randomUUID()}@test.local`,
      password: 'Password123',
      displayName: 'Inicial',
      role: 'viewer',
    }, actor);
    createdUids.push(created.id);

    const prepared = await users.prepareUpdate({
      uid: created.id,
      actorId: actor,
      changes: { displayName: 'Snapshot antiguo' },
      requestHash: 'c'.repeat(64),
      operationId: randomUUID(),
    });
    await db.collection('users').doc(created.id).update({ enabled: false, profileVersion: 3 });

    const result = await usersService.recoverPending(100);
    expect(result.completed).toBeGreaterThanOrEqual(1);
    const stored = await users.getById(created.id);
    expect(stored).toMatchObject({ enabled: false, profileVersion: 3, pendingOperationId: null });
    expect(identity.identities.get(created.id)?.disabled).toBe(true);
    expect((await db.collection('userOperations').doc(prepared.operation.id).get()).data()?.status)
      .toBe('completed');
  }, 30000);

  it('rechaza el reintento de creación si el perfil cambió después', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const input = {
      email: `changed-${randomUUID()}@test.local`,
      password: 'Password123',
      displayName: 'Original',
      role: 'viewer' as const,
    };
    const created = await usersService.create(input, actor);
    createdUids.push(created.id);
    await usersService.update(created.id, { displayName: 'Cambiado' }, actor);

    await expect(usersService.create(input, actor)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      statusCode: 409,
    });
    await usersService.update(created.id, { enabled: false }, actor);
    await expect(usersService.create(input, actor)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      statusCode: 409,
    });
  }, 30000);

  it('serializa recuperadores concurrentes y aplica la identidad una sola vez', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const created = await usersService.create({
      email: `concurrent-${randomUUID()}@test.local`,
      password: 'Password123',
      displayName: 'Inicial',
      role: 'viewer',
    }, actor);
    createdUids.push(created.id);
    const prepared = await users.prepareUpdate({
      uid: created.id,
      actorId: actor,
      changes: { displayName: 'Concurrente' },
      requestHash: 'd'.repeat(64),
      operationId: randomUUID(),
    });

    const results = await Promise.all([
      usersService.recoverPending(100),
      usersService.recoverPending(100),
    ]);
    expect(results.reduce((sum, result) => sum + result.completed, 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + result.failed, 0)).toBe(0);
    expect(identity.updates.filter((row) => row.uid === created.id)).toHaveLength(1);
    expect((await db.collection('userOperations').doc(prepared.operation.id).get()).data()?.status)
      .toBe('completed');
  }, 30000);

  it('recupera actualizaciones pendientes y omite creaciones sin identidad', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const created = await usersService.create({
      email: `recover-${randomUUID()}@test.local`,
      password: 'Password123',
      displayName: 'Antes',
      role: 'viewer',
    }, actor);
    createdUids.push(created.id);
    await users.prepareUpdate({
      uid: created.id,
      actorId: actor,
      changes: { displayName: 'Después' },
      requestHash: 'a'.repeat(64),
      operationId: randomUUID(),
    });
    const result = await usersService.recoverPending(100);
    expect(result.completed).toBeGreaterThanOrEqual(1);
    expect((await users.getById(created.id))?.displayName).toBe('Después');

    const orphanEmail = `orphan-${randomUUID()}@test.local`;
    const orphanUid = randomUUID();
    createdUids.push(orphanUid);
    const operationId = userCreateOperationId(orphanEmail);
    await users.prepareCreate({
      uid: orphanUid,
      operationId,
      actorId: actor,
      email: orphanEmail,
      displayName: 'Huérfano',
      role: 'viewer',
      requestHash: 'b'.repeat(64),
    });
    const second = await usersService.recoverPending(100);
    expect(second.skipped).toBeGreaterThanOrEqual(1);
    expect((await db.collection('userOperations').doc(operationId).get()).data()?.status).toBe('pending');
  }, 30000);

  it('no devuelve éxito a otro admin mientras sigue pendiente la sincronización', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const created = await usersService.create({ email: `noop-${randomUUID()}@test.local`,
      password: 'Password123', displayName: 'Inicial', role: 'viewer' }, actor);
    createdUids.push(created.id);
    identity.failNextUpdate = true;
    await expect(usersService.update(created.id, { enabled: false }, actor))
      .rejects.toMatchObject({ code: 'AUTH_SYNC_PENDING' });
    identity.failNextUpdate = true;
    await expect(usersService.update(created.id, { enabled: false }, 'another-admin'))
      .rejects.toMatchObject({ code: 'AUTH_SYNC_PENDING', statusCode: 503 });
    const result = await usersService.update(created.id, { enabled: false }, 'another-admin');
    expect(result.enabled).toBe(false);
    expect((await users.getById(created.id))?.pendingOperationId).toBeNull();
    expect(identity.identities.get(created.id)?.disabled).toBe(true);
    const audits = await db.collection('auditLogs').where('targetId', '==', created.id)
      .where('action', '==', 'user.update').get();
    expect(audits.size).toBe(1);
  }, 30000);

  it('repara una escritura tardía después de perder el reclamo y completar otra versión', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const created = await usersService.create({ email: `lease-${randomUUID()}@test.local`,
      password: 'Password123', displayName: 'Inicial', role: 'viewer' }, actor);
    createdUids.push(created.id);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const update = identity.updateIdentity.bind(identity);
    vi.spyOn(identity, 'updateIdentity').mockImplementationOnce(async (uid, input) => {
      entered();
      await blocked;
      await update(uid, input);
    });
    const oldWorker = usersService.update(created.id, { displayName: 'Anterior' }, actor);
    try {
      await started;
      await db.collection('users').doc(created.id).update({ authSyncExpiresAt: '2000-01-01T00:00:00.000Z' });
      await usersService.update(created.id, { enabled: false }, actor);
      expect(identity.identities.get(created.id)?.disabled).toBe(true);
    } finally {
      release();
    }
    await oldWorker;
    expect(identity.identities.get(created.id)?.disabled).toBe(true);
    expect((await users.getById(created.id))?.pendingOperationId).toBeNull();
    const audits = await db.collection('auditLogs').where('targetId', '==', created.id)
      .where('action', '==', 'user.update').get();
    expect(audits.size).toBe(2); // Reconciliation is not another administrative change.
  }, 30000);

  it('continúa después de una página de creaciones que esperan contraseña', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    for (let index = 0; index < 3; index++) {
      const uid = randomUUID();
      const email = `waiting-${randomUUID()}@test.local`;
      createdUids.push(uid);
      const operationId = userCreateOperationId(email);
      await users.prepareCreate({ uid, operationId, actorId: actor, email,
        displayName: 'Espera contraseña', role: 'viewer', requestHash: 'e'.repeat(64) });
      await db.collection('userOperations').doc(operationId).update({ createdAt: `2000-01-0${index + 1}T00:00:00.000Z` });
    }
    const created = await usersService.create({ email: `later-${randomUUID()}@test.local`,
      password: 'Password123', displayName: 'Inicial', role: 'viewer' }, actor);
    createdUids.push(created.id);
    await users.prepareUpdate({ uid: created.id, actorId: actor, changes: { enabled: false },
      requestHash: 'f'.repeat(64), operationId: randomUUID() });
    const first = await usersService.recoverPending(2, 1);
    expect(first.nextCursor).toBeDefined();
    await usersService.recoverPending(2, 10, first.nextCursor);
    expect(identity.identities.get(created.id)?.disabled).toBe(true);
    expect((await users.getById(created.id))?.pendingOperationId).toBeNull();
  }, 30000);

  it('conserva una reparación durable si Auth falla después de una escritura tardía', async () => {
    const identity = new FakeIdentity();
    const usersService = service(identity);
    const created = await usersService.create({ email: `repair-${randomUUID()}@test.local`,
      password: 'Password123', displayName: 'Inicial', role: 'viewer' }, actor);
    createdUids.push(created.id);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const update = identity.updateIdentity.bind(identity);
    let calls = 0;
    vi.spyOn(identity, 'updateIdentity').mockImplementation(async (uid, input) => {
      calls++;
      if (calls === 1) { entered(); await blocked; }
      if (calls === 3) throw new Error('controlled repair failure');
      await update(uid, input);
    });
    const oldWorker = usersService.update(created.id, { displayName: 'Anterior' }, actor);
    const oldOutcome = expect(oldWorker).rejects.toMatchObject({ code: 'AUTH_SYNC_PENDING', statusCode: 503 });
    try {
      await started;
      await db.collection('users').doc(created.id).update({ authSyncExpiresAt: '2000-01-01T00:00:00.000Z' });
      await usersService.update(created.id, { enabled: false }, actor);
    } finally { release(); }
    await oldOutcome;
    const pending = await users.getById(created.id);
    expect(pending?.enabled).toBe(false);
    expect(pending?.pendingOperationId).toEqual(expect.any(String));
    // A new service instance resumes the journal; no old in-memory state is needed.
    await service(identity).recoverPending(100);
    expect(identity.identities.get(created.id)?.disabled).toBe(true);
    expect((await users.getById(created.id))?.pendingOperationId).toBeNull();
  }, 30000);

  afterAll(async () => {
    if (!app) return;
    const operations = await db.collection('userOperations').where('actorId', '==', actor).get();
    const audits = await db.collection('auditLogs').where('actorId', '==', actor).get();
    const batch = db.batch();
    for (const uid of createdUids) batch.delete(db.collection('users').doc(uid));
    for (const uid of createdUids) {
      const repairs = await db.collection('userOperations').where('uid', '==', uid).get();
      for (const row of repairs.docs) {
        if (row.data().actorId !== actor) batch.delete(row.ref);
      }
    }
    for (const row of operations.docs) batch.delete(row.ref);
    for (const row of audits.docs) batch.delete(row.ref);
    await batch.commit();
    await deleteApp(app);
  });
});
