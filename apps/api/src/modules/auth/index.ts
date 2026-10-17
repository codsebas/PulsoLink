import { createAuthMiddleware } from './auth.middleware.js';
import { createCsrf } from './csrf.js';
import { authConfig, authIdentityProvider, authUserRepository } from './deps.js';

/**
 * Punto de entrada del módulo de autenticación para el resto del backend.
 *
 * Exporta los middlewares ya ligados a los adaptadores reales (Firebase Auth y
 * perfiles de Firestore) para proteger las rutas web sin volver a construir
 * dependencias:
 *
 *   app.use('/api/v1/devices', requireUser, devicesRouter);
 *   app.use('/api/v1/sessions', requireUser, csrfProtection, sessionsRouter);
 */
const authMiddleware = createAuthMiddleware({
  identityProvider: authIdentityProvider,
  userRepository: authUserRepository,
});

export const requireUser = authMiddleware.requireUser;
export const requireRole = authMiddleware.requireRole;

const csrf = createCsrf({
  secret: authConfig.csrfSecret,
  secure: authConfig.cookieSecure,
  origins: authConfig.appOrigins,
});

export const csrfProtection = csrf.csrfProtection;

export * from './auth.types.js';
export * from './session-access.js';
export { AuthError } from './auth.errors.js';
export { loadAuthConfigFromEnv, type AuthConfig } from './auth.config.js';
export { createAuthRouter, type AuthRouterDeps } from './auth.router.js';
export {
  createAuthMiddleware,
  type AuthMiddleware,
  type AuthMiddlewareDeps,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './auth.middleware.js';
export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './csrf.js';
export {
  FirebaseIdentityProvider,
  createFirebaseIdentityProvider,
  type FirebaseIdentityProviderOptions,
} from './adapters/firebase-identity-provider.js';
export { UsersRepositoryAdapter } from './adapters/users-repository-adapter.js';
export {
  InMemoryIdentityProvider,
  type InMemoryIdentityProviderOptions,
  type InMemoryUserSeed,
} from './adapters/in-memory-identity-provider.js';
export { InMemoryUserRepository } from './adapters/in-memory-user-repository.js';
