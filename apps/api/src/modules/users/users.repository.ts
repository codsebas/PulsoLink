import { createHash } from 'node:crypto';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getDb } from '../../config/firebase.js';
import { documentId, pagination, PersistenceError, type PageOptions } from '../../shared/persistence.js';
import type { StoredUserRole, UserRole } from '../../shared/types.js';
import { writeAudit } from '../audit/audit.repository.js';

export interface UserDocument {
  uid: string;
  displayName: string;
  role: StoredUserRole;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string | null;
  profileVersion?: number;
  pendingOperationId?: string | null;
  authSyncedAt?: string | null;
  authSyncOwner?: string | null;
  authSyncExpiresAt?: string | null;
}

export type UserOperationAction = 'user.create' | 'user.update';
export type UserOperationStatus = 'pending' | 'completed' | 'superseded';

export interface UserOperationDocument {
  version?: 1;
  id: string;
  action: UserOperationAction;
  uid: string;
  actorId: string;
  requestHash: string;
  email: string | null;
  desired: { displayName: string; role: StoredUserRole; enabled: boolean };
  fromVersion: number | null;
  toVersion: number;
  status: UserOperationStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  authSyncedAt: string | null;
  attempts: number;
  auditRecorded: boolean;
  supersededBy: string | null;
  supersededAt: string | null;
}

export interface UserUpdateChanges {
  displayName?: string;
  role?: UserRole;
  enabled?: boolean;
}

export interface PreparedUserOperation {
  user: UserDocument | null;
  operation: UserOperationDocument;
  resumed: boolean;
}

export interface UserSyncSnapshot {
  user: UserDocument;
  operation: UserOperationDocument | null;
}

export interface CompletedUserOperation {
  completed: boolean;
  user: UserDocument;
}

const roleSchema = z.enum(['admin', 'viewer', 'operator']);
const profileVersion = (user: UserDocument) => user.profileVersion ?? 1;

export function userCreateOperationId(email: string): string {
  return createHash('sha256')
    .update(JSON.stringify(['user.create', email.trim().toLowerCase()]))
    .digest('hex');
}

export function userRequestHash(action: UserOperationAction, values: unknown[]): string {
  return createHash('sha256').update(JSON.stringify([action, ...values])).digest('hex');
}

export function userDto(user: UserDocument) {
  return {
    id: user.uid,
    displayName: user.displayName,
    role: user.role === 'operator' ? 'viewer' : user.role,
    enabled: user.enabled,
    createdAt: user.createdAt,
  };
}

function operationRef(db: Firestore, operationId: string) {
  return db.collection('userOperations').doc(documentId.parse(operationId));
}

function sameDesired(user: UserDocument, changes: UserUpdateChanges): boolean {
  return (
    (changes.displayName === undefined || changes.displayName === user.displayName) &&
    (changes.role === undefined || changes.role === user.role) &&
    (changes.enabled === undefined || changes.enabled === user.enabled)
  );
}

export class UsersRepository {
  constructor(private readonly db: () => Firestore = getDb) {}

  async getById(uid: string): Promise<UserDocument | null> {
    const doc = await this.db().collection('users').doc(documentId.parse(uid)).get();
    return doc.exists ? ({ ...doc.data(), uid: doc.id } as UserDocument) : null;
  }

  async list(options: Pick<PageOptions, 'limit' | 'cursor'> & { enabled?: boolean } = {}) {
    const enabled = z.boolean().default(true).parse(options.enabled);
    const page = pagination(options, {
      collection: 'users',
      enabled,
      order: 'createdAt:desc,id:desc',
    });
    let query = this.db()
      .collection('users')
      .where('enabled', '==', enabled)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(page.limit + 1);
    if (page.after) query = query.startAfter(page.after.date, page.after.id);
    const rows = (await query.get()).docs
      .map((doc) => ({ ...doc.data(), uid: doc.id }) as UserDocument)
      .filter((row) => roleSchema.safeParse(row.role).success);
    return page.page(rows, (row) => ({ date: row.createdAt, id: row.uid }));
  }

  async prepareCreate(input: {
    uid: string;
    operationId: string;
    actorId: string;
    email: string;
    displayName: string;
    role: UserRole;
    requestHash: string;
  }): Promise<PreparedUserOperation> {
    const data = z.object({
      uid: documentId,
      operationId: documentId,
      actorId: documentId,
      email: z.string().email(),
      displayName: z.string().trim().min(1).max(120),
      role: z.enum(['admin', 'viewer']),
      requestHash: z.string().length(64),
    }).strict().parse(input);
    const db = this.db();
    const opRef = operationRef(db, data.operationId);
    const userRef = db.collection('users').doc(data.uid);
    return db.runTransaction(async (tx) => {
      const [existingOperation, existingUser] = await tx.getAll(opRef, userRef);
      if (existingOperation.exists) {
        const operation = existingOperation.data() as UserOperationDocument;
        if (
          operation.action !== 'user.create' ||
          operation.actorId !== data.actorId ||
          operation.requestHash !== data.requestHash
        ) {
          throw new PersistenceError('IDEMPOTENCY_CONFLICT', 'La operación de creación no coincide.');
        }
        if (operation.status === 'superseded') {
          throw new PersistenceError('IDEMPOTENCY_CONFLICT', 'La operación de creación fue reemplazada.');
        }
        const userSnapshot = existingUser.id === operation.uid
          ? existingUser
          : await tx.get(db.collection('users').doc(operation.uid));
        if (!userSnapshot.exists) {
          throw new PersistenceError('USER_NOT_FOUND', 'Usuario no encontrado.');
        }
        return {
          user: { ...userSnapshot.data(), uid: userSnapshot.id } as UserDocument,
          operation,
          resumed: true,
        };
      }

      if (existingUser.exists) {
        throw new PersistenceError('IDEMPOTENCY_CONFLICT', 'El usuario ya existe.');
      }

      const now = new Date().toISOString();
      const user: UserDocument = {
        uid: data.uid,
        displayName: data.displayName,
        role: data.role,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        profileVersion: 1,
        pendingOperationId: data.operationId,
        authSyncedAt: null,
        authSyncOwner: null,
        authSyncExpiresAt: null,
      };
      const operation: UserOperationDocument = {
        version: 1,
        id: data.operationId,
        action: 'user.create',
        uid: data.uid,
        actorId: data.actorId,
        requestHash: data.requestHash,
        email: data.email,
        desired: { displayName: data.displayName, role: data.role, enabled: true },
        fromVersion: null,
        toVersion: 1,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        authSyncedAt: null,
        attempts: 0,
        auditRecorded: false,
        supersededBy: null,
        supersededAt: null,
      };
      tx.create(userRef, user);
      tx.create(opRef, operation);
      return { user, operation, resumed: false };
    });
  }

  async prepareUpdate(input: {
    uid: string;
    actorId: string;
    changes: UserUpdateChanges;
    requestHash: string;
    operationId: string;
  }): Promise<PreparedUserOperation> {
    const data = z.object({
      uid: documentId,
      actorId: documentId,
      changes: z.object({
        displayName: z.string().trim().min(1).max(120).optional(),
        role: z.enum(['admin', 'viewer']).optional(),
        enabled: z.boolean().optional(),
      }).strict().refine((value) => Object.keys(value).length > 0),
      requestHash: z.string().length(64),
      operationId: documentId,
    }).strict().parse(input);
    const db = this.db();
    const userRef = db.collection('users').doc(data.uid);
    return db.runTransaction(async (tx) => {
      const userSnapshot = await tx.get(userRef);
      if (!userSnapshot.exists) {
        throw new PersistenceError('USER_NOT_FOUND', 'Usuario no encontrado.');
      }
      const user = { ...userSnapshot.data(), uid: userSnapshot.id } as UserDocument;
      let pending: UserOperationDocument | null = null;
      if (user.pendingOperationId) {
        const pendingSnapshot = await tx.get(operationRef(db, user.pendingOperationId));
        if (!pendingSnapshot.exists) {
          throw new PersistenceError('IDEMPOTENCY_CONFLICT', 'La operación pendiente no existe.');
        }
        pending = pendingSnapshot.data() as UserOperationDocument;
      }

      if (
        pending &&
        pending.action === 'user.update' &&
        pending.status === 'pending' &&
        pending.actorId === data.actorId &&
        pending.requestHash === data.requestHash
      ) {
        return { user, operation: pending, resumed: true };
      }

      if (sameDesired(user, data.changes)) {
        if (pending?.status === 'pending') {
          if (pending.action === 'user.update') return { user, operation: pending, resumed: true };
          throw new PersistenceError('AUTH_SYNC_PENDING', 'La creación aún no está sincronizada.');
        }
        throw new PersistenceError('NO_CHANGES', 'El usuario ya tiene esos valores.');
      }
      if (pending?.action === 'user.create' && pending.status === 'pending') {
        throw new PersistenceError(
          'IDEMPOTENCY_CONFLICT',
          'La creación aún está pendiente; reintente cuando termine.',
        );
      }

      const now = new Date().toISOString();
      const desired = {
        displayName: data.changes.displayName ?? user.displayName,
        role: data.changes.role ?? user.role,
        enabled: data.changes.enabled ?? user.enabled,
      };
      const fromVersion = profileVersion(user);
      const operation: UserOperationDocument = {
        version: 1,
        id: data.operationId,
        action: 'user.update',
        uid: user.uid,
        actorId: data.actorId,
        requestHash: data.requestHash,
        email: null,
        desired,
        fromVersion,
        toVersion: fromVersion + 1,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        authSyncedAt: null,
        attempts: 0,
        auditRecorded: true,
        supersededBy: null,
        supersededAt: null,
      };

      if (pending?.status === 'pending') {
        tx.update(operationRef(db, pending.id), {
          status: 'superseded',
          supersededBy: operation.id,
          supersededAt: now,
          updatedAt: now,
        });
      }

      tx.create(operationRef(db, data.operationId), operation);
      tx.update(userRef, {
        ...desired,
        profileVersion: operation.toVersion,
        pendingOperationId: operation.id,
        updatedAt: now,
      });
      writeAudit(tx, db, {
        actorId: operation.actorId,
        action: 'user.update',
        targetType: 'user',
        targetId: operation.uid,
      });
      return {
        user: { ...user, ...desired, profileVersion: operation.toVersion, pendingOperationId: operation.id },
        operation,
        resumed: false,
      };
    });
  }

  async claimUserSync(uid: string, owner: string, ttlMs = 60_000): Promise<UserSyncSnapshot> {
    const db = this.db();
    const userRef = db.collection('users').doc(documentId.parse(uid));
    return db.runTransaction(async (tx) => {
      const userSnapshot = await tx.get(userRef);
      if (!userSnapshot.exists) {
        throw new PersistenceError('USER_NOT_FOUND', 'Usuario no encontrado.');
      }
      const user = { ...userSnapshot.data(), uid: userSnapshot.id } as UserDocument;
      let operation: UserOperationDocument | null = null;
      if (user.pendingOperationId) {
        const opSnapshot = await tx.get(operationRef(db, user.pendingOperationId));
        if (!opSnapshot.exists) {
          throw new PersistenceError('USER_OPERATION_NOT_FOUND', 'Operación no encontrada.');
        }
        operation = opSnapshot.data() as UserOperationDocument;
      }

      const now = Date.now();
      if (
        user.authSyncOwner &&
        user.authSyncOwner !== owner &&
        user.authSyncExpiresAt &&
        Date.parse(user.authSyncExpiresAt) > now
      ) {
        throw new PersistenceError('AUTH_SYNC_PENDING', 'La sincronización aún está en curso.');
      }

      const authSyncExpiresAt = new Date(now + ttlMs).toISOString();
      if (operation) {
        tx.update(operationRef(db, operation.id), {
          attempts: operation.attempts + 1,
          updatedAt: new Date(now).toISOString(),
        });
      }
      tx.update(userRef, { authSyncOwner: owner, authSyncExpiresAt });
      return {
        user: { ...user, authSyncOwner: owner, authSyncExpiresAt },
        operation: operation ? { ...operation, attempts: operation.attempts + 1 } : null,
      };
    });
  }

  async releaseUserSync(uid: string, owner: string): Promise<void> {
    const db = this.db();
    const userRef = db.collection('users').doc(documentId.parse(uid));
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(userRef);
      if (!snapshot.exists) return;
      const user = snapshot.data() as UserDocument;
      if (user.authSyncOwner !== owner) return;
      tx.update(userRef, { authSyncOwner: null, authSyncExpiresAt: null });
    });
  }

  /** A late Auth write may invalidate an already completed operation. Reopen
   * reconciliation against the CURRENT profile, without another business audit.
   * Other pending work is preserved and the repair survives a process restart. */
  async requestReconciliation(uid: string): Promise<void> {
    const db = this.db();
    const userRef = db.collection('users').doc(documentId.parse(uid));
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(userRef);
      if (!snapshot.exists) throw new PersistenceError('USER_NOT_FOUND', 'Usuario no encontrado.');
      const user = { ...snapshot.data(), uid: snapshot.id } as UserDocument;
      if (user.pendingOperationId) return;
      const now = new Date().toISOString();
      const id = userRequestHash('user.update', [uid, profileVersion(user), now, db.collection('userOperations').doc().id]);
      const operation: UserOperationDocument = {
        version: 1, id, action: 'user.update', uid, actorId: 'system', requestHash: id, email: null,
        desired: { displayName: user.displayName, role: user.role, enabled: user.enabled },
        fromVersion: profileVersion(user), toVersion: profileVersion(user), status: 'pending',
        createdAt: now, updatedAt: now, completedAt: null, authSyncedAt: null,
        attempts: 0, auditRecorded: true, supersededBy: null, supersededAt: null,
      };
      tx.create(operationRef(db, id), operation);
      tx.update(userRef, { pendingOperationId: id });
    });
  }

  async completeCurrentOperation(
    uid: string,
    operationId: string,
    owner: string,
    syncedVersion?: number,
  ): Promise<CompletedUserOperation> {
    const db = this.db();
    const userRef = db.collection('users').doc(documentId.parse(uid));
    return db.runTransaction(async (tx) => {
      const [userSnapshot, opSnapshot] = await tx.getAll(
        userRef,
        operationRef(db, operationId),
      );
      if (!userSnapshot.exists) throw new PersistenceError('USER_NOT_FOUND', 'Usuario no encontrado.');
      if (!opSnapshot.exists) {
        throw new PersistenceError('USER_OPERATION_NOT_FOUND', 'Operación no encontrada.');
      }
      const user = { ...userSnapshot.data(), uid: userSnapshot.id } as UserDocument;
      const operation = opSnapshot.data() as UserOperationDocument;
      if (
        operation.uid !== user.uid ||
        operation.status !== 'pending' ||
        user.pendingOperationId !== operation.id ||
        (syncedVersion !== undefined && profileVersion(user) !== syncedVersion)
      ) {
        return { completed: false, user };
      }
      if (
        user.authSyncOwner !== owner ||
        !user.authSyncExpiresAt ||
        Date.parse(user.authSyncExpiresAt) <= Date.now()
      ) {
        throw new PersistenceError('AUTH_SYNC_PENDING', 'La sincronización perdió su reclamo.');
      }

      const now = new Date().toISOString();
      tx.update(opSnapshot.ref, {
        status: 'completed',
        completedAt: now,
        authSyncedAt: now,
        auditRecorded: true,
        updatedAt: now,
      });
      const update: Partial<UserDocument> = {
        authSyncedAt: now,
        pendingOperationId: null,
        authSyncOwner: null,
        authSyncExpiresAt: null,
        updatedAt: now,
      };
      tx.update(userRef, update);
      if (!operation.auditRecorded) {
        writeAudit(tx, db, {
          actorId: operation.actorId,
          action: operation.action,
          targetType: 'user',
          targetId: operation.uid,
        });
      }
      return { completed: true, user: { ...user, ...update } };
    });
  }

  async discardCreate(operationId: string, uid: string): Promise<void> {
    const db = this.db();
    const opRef = operationRef(db, operationId);
    const userRef = db.collection('users').doc(documentId.parse(uid));
    await db.runTransaction(async (tx) => {
      const [opSnapshot, userSnapshot] = await tx.getAll(opRef, userRef);
      if (!opSnapshot.exists) return;
      const operation = opSnapshot.data() as UserOperationDocument;
      if (operation.status !== 'pending' || operation.uid !== uid) return;
      if (userSnapshot.exists && profileVersion(userSnapshot.data() as UserDocument) === 1) {
        tx.delete(userRef);
      }
      tx.delete(opRef);
    });
  }

  async listPendingOperations(
    limit = 50,
    after?: { createdAt: string; id: string },
  ): Promise<UserOperationDocument[]> {
    const bounded = z.number().int().min(1).max(100).parse(limit);
    let query = this.db()
      .collection('userOperations')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(bounded);
    if (after) query = query.startAfter(after.createdAt, after.id);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as UserOperationDocument);
  }
}
