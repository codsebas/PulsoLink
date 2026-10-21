import { z } from 'zod';
import type { AppUser, UserRepository } from '../auth.types.js';
import { UsersRepository } from '../../users/users.repository.js';
import { toEffectiveRole } from '../../../shared/types.js';

const profileSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string(),
  role: z.enum(['admin', 'viewer', 'operator']),
  enabled: z.boolean(),
});

/**
 * Adaptador del puerto `UserRepository` de autenticación sobre el repositorio
 * de usuarios de persistencia. No duplica acceso a Firestore y aplica el rol
 * efectivo: `operator` legado solo conserva permisos de `viewer`.
 */
export class UsersRepositoryAdapter implements UserRepository {
  constructor(private readonly users: UsersRepository = new UsersRepository()) {}

  async findById(uid: string): Promise<AppUser | null> {
    const document = await this.users.getById(uid);
    if (!document) {
      return null;
    }

    const parsed = profileSchema.safeParse(document);
    if (!parsed.success) {
      console.warn(`[auth] El documento users/${uid} no cumple el esquema esperado; se ignora.`);
      return null;
    }

    const role = toEffectiveRole(parsed.data.role);
    if (!role) {
      console.warn(`[auth] El documento users/${uid} tiene un rol inválido; se ignora.`);
      return null;
    }

    return {
      id: parsed.data.uid,
      displayName: parsed.data.displayName,
      role,
      enabled: parsed.data.enabled,
    };
  }
}
