import { createAuthRouter } from './auth.router.js';
import { authConfig, authIdentityProvider, authUserRepository } from './deps.js';

/**
 * Router montado por `src/app.ts` en `/api/v1/auth`, con los adaptadores reales
 * (Firebase Auth REST + cookie de sesión con Admin SDK, perfiles de Firestore).
 */
export const authRouter = createAuthRouter({
  config: authConfig,
  identityProvider: authIdentityProvider,
  userRepository: authUserRepository,
});
