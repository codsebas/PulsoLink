/**
 * Recuperación manual y acotada de operaciones de usuarios pendientes.
 *
 *   npx tsx src/scripts/recover-user-operations.ts
 *
 * No crea identidades sin contraseña: las creaciones cuyo UID aún no existe en
 * Firebase Auth se dejan pendientes para el reintento del cliente. No imprime
 * correos, tokens ni credenciales.
 */
import { getDb } from '../config/firebase.js';
import { authIdentityProvider } from '../modules/auth/deps.js';
import { UsersRepository } from '../modules/users/users.repository.js';
import { UsersService } from '../modules/users/users.service.js';

async function main() {
  if (!process.env.FIREBASE_PROJECT_ID) {
    throw new Error('Falta FIREBASE_PROJECT_ID.');
  }
  const service = new UsersService({
    users: new UsersRepository(getDb),
    identity: authIdentityProvider,
  });
  let cursor: { createdAt: string; id: string } | undefined;
  do {
    const result = await service.recoverPending(50, 10, cursor);
    // The cursor is internal; logs contain counts only.
    console.log(`Recuperación de usuarios: ${JSON.stringify({
      scanned: result.scanned, completed: result.completed, skipped: result.skipped, failed: result.failed,
    })}`);
    cursor = result.nextCursor;
  } while (cursor);
}

main().catch(() => {
  console.error('No se completó la recuperación de operaciones de usuarios. Revise la configuración de Firebase y reintente.');
  process.exitCode = 1;
});
