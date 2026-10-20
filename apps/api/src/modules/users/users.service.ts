import { randomUUID } from 'node:crypto';
import { AppError } from '../../middleware/error-handler.js';
import { PersistenceError, type PageOptions } from '../../shared/persistence.js';
import type { UserRole } from '../../shared/types.js';
import type { IdentityProvider } from '../auth/auth.types.js';
import { authIdentityProvider } from '../auth/deps.js';
import {
  UsersRepository,
  userCreateOperationId,
  userDto,
  userRequestHash,
  type UserDocument,
  type UserOperationDocument,
  type UserUpdateChanges,
} from './users.repository.js';

type UsersIdentity = Pick<
  IdentityProvider,
  'createIdentity' | 'getIdentity' | 'updateIdentity' | 'revokeSessions'
>;

export interface UsersDependencies {
  users: UsersRepository;
  identity: UsersIdentity;
}

export function userDependencies(): UsersDependencies {
  return { users: new UsersRepository(), identity: authIdentityProvider };
}

function authSyncPending(): AppError {
  return new AppError(
    'AUTH_SYNC_PENDING',
    'El cambio se guardó, pero la identidad aún no se sincronizó. Reintente la misma operación.',
    503,
  );
}

function identityRole(role: UserOperationDocument['desired']['role'] | UserDocument['role']): UserRole | undefined {
  return role === 'operator' ? undefined : role;
}

function conflict(message: string): AppError {
  return new AppError('IDEMPOTENCY_CONFLICT', message, 409);
}

function createStateMatches(user: UserDocument, operation: UserOperationDocument): boolean {
  return (
    user.displayName === operation.desired.displayName &&
    user.role === operation.desired.role &&
    user.enabled === operation.desired.enabled
  );
}

function authIdentity(user: UserDocument) {
  return {
    displayName: user.displayName,
    disabled: !user.enabled,
    ...(identityRole(user.role) ? { role: identityRole(user.role) } : {}),
  };
}

export class UsersService {
  constructor(private readonly deps: UsersDependencies = userDependencies()) {}

  async list(options: Pick<PageOptions, 'limit' | 'cursor'> & { enabled?: boolean }) {
    return this.deps.users.list(options);
  }

  async get(uid: string) {
    const user = await this.deps.users.getById(uid);
    if (!user) throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado.', 404);
    return userDto(user);
  }

  async create(input: {
    email: string;
    password: string;
    displayName: string;
    role: UserRole;
  }, actorId: string) {
    const email = input.email.trim().toLowerCase();
    const operationId = userCreateOperationId(email);
    const prepared = await this.deps.users.prepareCreate({
      uid: randomUUID(),
      operationId,
      actorId,
      email,
      displayName: input.displayName,
      role: input.role,
      requestHash: userRequestHash('user.create', [email, input.displayName, input.role]),
    });
    return userDto(await this.finishCreate(prepared.operation, input.password));
  }

  async update(uid: string, input: UserUpdateChanges, actorId: string) {
    const requestHash = userRequestHash('user.update', [
      uid,
      input.displayName ?? null,
      input.role ?? null,
      input.enabled ?? null,
    ]);
    let prepared;
    try {
      prepared = await this.deps.users.prepareUpdate({
        uid,
        actorId,
        changes: input,
        requestHash,
        operationId: randomUUID(),
      });
    } catch (error) {
      if (error instanceof PersistenceError && error.code === 'NO_CHANGES') {
        return this.get(uid);
      }
      throw error;
    }
    const user = await this.finishUpdate(prepared.operation);
    return userDto(user);
  }

  private async finishCreate(
    operation: UserOperationDocument,
    password: string | undefined,
  ): Promise<UserDocument> {
    if (operation.status === 'superseded') {
      throw conflict('La operación de creación fue reemplazada.');
    }
    if (operation.status === 'completed') {
      const current = await this.requireUser(operation.uid);
      if (!createStateMatches(current, operation)) {
        throw conflict('El usuario cambió después de la creación; la operación ya no es reproducible.');
      }
      return current;
    }

    const current = await this.requireUser(operation.uid);
    if (!createStateMatches(current, operation)) {
      throw conflict('El usuario cambió después de la creación; la operación ya no es reproducible.');
    }

    let identity = await this.deps.identity.getIdentity(operation.uid);
    if (!identity) {
      if (!password) throw authSyncPending();
      try {
        await this.deps.identity.createIdentity({
          uid: operation.uid,
          email: operation.email ?? '',
          password,
          displayName: operation.desired.displayName,
          role: identityRole(operation.desired.role) ?? 'viewer',
        });
      } catch (error) {
        if (error instanceof AppError && error.code === 'USER_CREATE_CONFLICT') {
          const existing = await this.deps.identity.getIdentity(operation.uid).catch(() => null);
          if (existing && existing.email?.toLowerCase() === operation.email?.toLowerCase()) {
            identity = existing;
          } else {
            await this.deps.users.discardCreate(operation.id, operation.uid);
            throw new AppError(
              'IDEMPOTENCY_CONFLICT',
              'El correo ya pertenece a otra identidad; no se adoptó.',
              409,
            );
          }
        } else {
          throw authSyncPending();
        }
      }
      if (!identity) {
        identity = await this.deps.identity.getIdentity(operation.uid);
      }
    }

    if (!identity || identity.email?.toLowerCase() !== operation.email?.toLowerCase()) {
      await this.deps.users.discardCreate(operation.id, operation.uid);
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'La identidad existente no coincide con la operación; no se adoptó.',
        409,
      );
    }

    const result = await this.runUserSync(operation.uid, true);
    if (!result.completed) {
      const latest = await this.requireUser(operation.uid);
      if (latest.pendingOperationId === operation.id) throw authSyncPending();
      if (!createStateMatches(latest, operation)) {
        throw conflict('El usuario cambió después de la creación; la operación ya no es reproducible.');
      }
      return latest;
    }
    if (!createStateMatches(result.user, operation)) {
      throw conflict('El usuario cambió después de la creación; la operación ya no es reproducible.');
    }
    return result.user;
  }

  private async finishUpdate(operation: UserOperationDocument): Promise<UserDocument> {
    if (operation.status !== 'pending') return this.requireUser(operation.uid);
    const result = await this.runUserSync(operation.uid, false);
    if (result.user.pendingOperationId) throw authSyncPending();
    return result.user;
  }

  private async runUserSync(
    uid: string,
    allowCreate: boolean,
  ): Promise<{ user: UserDocument; completed: boolean }> {
    const owner = randomUUID();
    let acquired = false;
    let authWriteStarted = false;
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const snapshot = await this.deps.users.claimUserSync(uid, owner);
        acquired = true;
        const operation = snapshot.operation;
        if (!operation || operation.status !== 'pending') {
          return { user: snapshot.user, completed: false };
        }

        if (operation.action === 'user.create') {
          if (!allowCreate) throw authSyncPending();
          const identity = await this.deps.identity.getIdentity(uid).catch(() => null);
          if (
            !identity ||
            identity.email?.toLowerCase() !== operation.email?.toLowerCase() ||
            !createStateMatches(snapshot.user, operation)
          ) {
            return { user: snapshot.user, completed: false };
          }
        } else {
          authWriteStarted = true;
          await this.deps.identity.updateIdentity(uid, authIdentity(snapshot.user));
          await this.deps.identity.revokeSessions(uid);
        }

        const completed = await this.deps.users.completeCurrentOperation(
          uid,
          operation.id,
          owner,
          snapshot.user.profileVersion ?? 1,
        );
        if (completed.completed) {
          authWriteStarted = false;
          return { user: completed.user, completed: true };
        }
        // A newer worker may already have cleared pendingOperationId. Do not
        // leave its profile paired with our late, older Auth write.
        if (authWriteStarted) await this.deps.users.requestReconciliation(uid);
      }
      throw authSyncPending();
    } catch (error) {
      if (authWriteStarted) {
        await this.deps.users.requestReconciliation(uid);
      }
      if (
        error instanceof AppError &&
        (error.code === 'AUTH_SYNC_PENDING' ||
          error.code === 'IDEMPOTENCY_CONFLICT' ||
          error.code === 'USER_NOT_FOUND')
      ) {
        throw error;
      }
      if (error instanceof PersistenceError && error.code !== 'AUTH_SYNC_PENDING') throw error;
      throw authSyncPending();
    } finally {
      if (acquired) {
        await this.deps.users.releaseUserSync(uid, owner).catch(() => undefined);
      }
    }
  }

  private async requireUser(uid: string): Promise<UserDocument> {
    const user = await this.deps.users.getById(uid);
    if (!user) throw new AppError('USER_NOT_FOUND', 'Usuario no encontrado.', 404);
    return user;
  }

  /**
   * Recuperación acotada y sin cola: sincroniza el estado actual del perfil, no
   * el snapshot histórico de la operación. Una creación sin identidad Auth no
   * puede completarse aquí porque la contraseña no se persiste.
   */
  async recoverPending(
    limit = 20,
    maxPages = 10,
    after?: { createdAt: string; id: string },
  ) {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
      throw new Error('Número de páginas de recuperación inválido.');
    }
    const visited = new Set<string>();
    let scanned = 0;
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    let cursor = after;
    let nextCursor: typeof after;
    for (let page = 0; page < maxPages; page++) {
      const operations = await this.deps.users.listPendingOperations(limit, cursor);
      scanned += operations.length;
      for (const operation of operations) {
        const uid = operation.uid;
        if (visited.has(uid)) continue;
        visited.add(uid);
        try {
          const result = await this.runUserSync(uid, true);
          if (result.completed) completed++;
          else skipped++;
        } catch (error) {
          if ((error instanceof AppError || error instanceof PersistenceError) && error.code === 'AUTH_SYNC_PENDING') {
            skipped++;
            continue;
          }
          failed++;
        }
      }
      const last = operations[operations.length - 1];
      if (operations.length < limit || !last) {
        nextCursor = undefined;
        break;
      }
      cursor = { createdAt: last.createdAt, id: last.id };
      nextCursor = cursor;
    }
    return { scanned, completed, skipped, failed, nextCursor };
  }
}
