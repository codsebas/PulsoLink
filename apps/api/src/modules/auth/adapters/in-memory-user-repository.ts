import type { AppUser, UserRepository } from '../auth.types.js';

/**
 * Repositorio de usuarios en memoria. `set()` permite preparar los casos de
 * prueba (por ejemplo, un usuario habilitado, uno deshabilitado o la ausencia
 * del documento users/{uid}).
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, AppUser>();

  set(user: AppUser): void {
    this.users.set(user.id, user);
  }

  async findById(uid: string): Promise<AppUser | null> {
    return this.users.get(uid) ?? null;
  }
}
