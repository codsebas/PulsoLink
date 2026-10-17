import { loadAuthConfigFromEnv } from './auth.config.js';
import { createFirebaseIdentityProvider } from './adapters/firebase-identity-provider.js';
import { UsersRepositoryAdapter } from './adapters/users-repository-adapter.js';

/**
 * Dependencias reales del módulo de autenticación, construidas una sola vez a
 * partir del entorno. Compartidas por `auth.routes.ts` (router) y `index.ts`
 * (middlewares reutilizables), de modo que no se dupliquen adaptadores.
 *
 * No tiene efectos secundarios de red: Firebase Admin solo se inicializa al
 * ejecutar la primera operación que lo requiere.
 */
export const authConfig = loadAuthConfigFromEnv();
export const authIdentityProvider = createFirebaseIdentityProvider(authConfig);
export const authUserRepository = new UsersRepositoryAdapter();
