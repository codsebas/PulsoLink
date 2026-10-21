import express, { type RequestHandler, type Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sendSuccess } from '../../shared/response.js';
import { AuditRepository } from '../audit/audit.repository.js';
import type { AuthConfig } from './auth.config.js';
import { AuthError } from './auth.errors.js';
import {
  createAuthMiddleware,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './auth.middleware.js';
import { createCsrf } from './csrf.js';
import { createLoginRateLimiter } from './login-rate-limit.js';
import type { IdentityProvider, UserRepository } from './auth.types.js';

export interface AuthRouterDeps {
  config: AuthConfig;
  identityProvider: IdentityProvider;
  userRepository: UserRepository;
  auditRepository?: Pick<AuditRepository, 'append'>;
}

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(128),
  })
  .strict();

type LoginBody = z.infer<typeof loginSchema>;

/**
 * Router del módulo de autenticación (contrato B). Se monta con
 * `app.use('/api/v1/auth', createAuthRouter({ config, identityProvider, userRepository }))`.
 *
 * No registra su propio manejador de errores ni vuelve a montar `cookie-parser`
 * o `express.json`: la aplicación ya los aplica (ver `src/app.ts`) y el
 * manejador global traduce `AuthError` y los errores de parseo del cuerpo.
 */
export function createAuthRouter(deps: AuthRouterDeps): Router {
  const { config, identityProvider, userRepository } = deps;
  const auditRepository = deps.auditRepository ?? new AuditRepository();

  const router = express.Router();
  const csrf = createCsrf({
    secret: config.csrfSecret,
    secure: config.cookieSecure,
    origins: config.appOrigins,
  });
  const { requireUser } = createAuthMiddleware({ identityProvider, userRepository });
  const loginRateLimiter = createLoginRateLimiter(config.loginRateLimit);

  const recordLogin = (actorId: string, result: 'success' | 'failure') =>
    auditRepository.append(
      { actorId, action: 'auth.login', targetType: 'auth', targetId: actorId, result },
      randomUUID(),
    );

  const validateLoginBody: RequestHandler = (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AuthError(400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud no es válido.'));
      return;
    }
    res.locals.loginBody = parsed.data satisfies LoginBody;
    next();
  };

  router.get('/csrf', (req, res) => {
    const csrfToken = csrf.getToken(req, res);
    sendSuccess(res, { csrfToken });
  });

  router.post('/login', csrf.csrfProtection, loginRateLimiter, validateLoginBody, async (req, res, next) => {
    let verifiedUid: string | null = null;
    try {
      const { email, password } = res.locals.loginBody as LoginBody;

      const { uid, idToken } = await identityProvider.verifyPassword(email, password);
      verifiedUid = uid;
      const user = await userRepository.findById(uid);
      if (!user) {
        throw new AuthError(401, 'UNAUTHENTICATED', 'La sesión no es válida.');
      }
      if (!user.enabled) {
        throw new AuthError(403, 'USER_DISABLED', 'La cuenta está deshabilitada.');
      }

      const sessionCookie = await identityProvider.createSessionCookie(idToken, config.sessionTtlMs);
      try {
        await recordLogin(uid, 'success');
      } catch {
        throw new AuthError(
          503,
          'AUDIT_UNAVAILABLE',
          'No se pudo registrar el inicio de sesión; no se entregó la sesión.',
        );
      }
      res.cookie(
        SESSION_COOKIE_NAME,
        sessionCookie,
        sessionCookieOptions(config.cookieSecure, config.sessionTtlMs),
      );
      csrf.rotate(res);

      sendSuccess(res, { id: user.id, displayName: user.displayName, role: user.role });
    } catch (error) {
      if (
        !(error instanceof AuthError && error.code === 'AUDIT_UNAVAILABLE') &&
        !(error instanceof AuthError && error.code === 'AUTH_UNAVAILABLE')
      ) {
        await recordLogin(verifiedUid ?? 'anonymous', 'failure').catch(() => undefined);
      }
      next(error);
    }
  });

  router.post('/logout', csrf.csrfProtection, (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(config.cookieSecure));
    csrf.rotate(res);
    res.status(204).end();
  });

  router.get('/me', requireUser, (req, res) => {
    sendSuccess(res, req.user);
  });

  return router;
}
