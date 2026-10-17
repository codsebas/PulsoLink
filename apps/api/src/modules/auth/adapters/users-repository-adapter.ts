import { z } from 'zod';
import type { AppUser, UserRepository } from '../auth.types.js';
import { UsersRepository } from '../../users/users.repository.js';

const profileSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string(),
  role: z.enum(['admin', 'operator']),
  enabled: z.boolean(),
});

/**
 * Adaptador del puerto `UserRepository` de autenticación sobre el repositorio
 * de usuarios de persistencia (`modules/users/users.repository.ts`, `@gioore`).
 *
 * No duplica acceso a Firestore: envuelve `UsersRepository`, mapea `uid`→`id` y
 * valida el documento con Zod. Si el documento no existe, o no cumple el
 * esquema, devuelve `null` y registra un aviso solo con el uid.
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

    return {
      id: parsed.data.uid,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      enabled: parsed.data.enabled,
    };
  }
}
