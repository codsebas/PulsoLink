import type { CookieOptions, RequestHandler } from 'express';
import { AuthError } from './auth.errors.js';
import { parseCookies } from './csrf.js';
import type { IdentityProvider, Role, UserRepository } from './auth.types.js';

export const SESSION_COOKIE_NAME = 'pulsolink_session';

export function sessionCookieOptions(secure: boolean, maxAgeMs?: number): CookieOptions {
  const options: CookieOptions = { httpOnly: true, sameSite: 'lax', path: '/', secure };
  if (maxAgeMs !== undefined) {
    options.maxAge = maxAgeMs;
  }
  return options;
}

export interface AuthMiddlewareDeps {
  identityProvider: IdentityProvider;
  userRepository: UserRepository;
}

export interface AuthMiddleware {
  requireUser: RequestHandler;
  requireRole: (...roles: Role[]) => RequestHandler;
}

/**
 * Middlewares de autenticación y autorización reutilizables por el resto del
 * equipo. `requireUser` lee la cookie de sesión aunque la aplicación no haya
 * montado `cookie-parser`.
 */
export function createAuthMiddleware(deps: AuthMiddlewareDeps): AuthMiddleware {
  const { identityProvider, userRepository } = deps;

  const requireUser: RequestHandler = async (req, _res, next) => {
    try {
      const cookies =
        (req.cookies as Record<string, string> | undefined) ?? parseCookies(req.headers.cookie);
      const cookie = cookies[SESSION_COOKIE_NAME];
      if (!cookie) {
        throw new AuthError(401, 'UNAUTHENTICATED', 'No hay una sesión activa.');
      }

      let uid: string;
      try {
        ({ uid } = await identityProvider.verifySessionCookie(cookie));
      } catch {
        throw new AuthError(401, 'UNAUTHENTICATED', 'La sesión no es válida o venció.');
      }

      const user = await userRepository.findById(uid);
      if (!user) {
        throw new AuthError(401, 'UNAUTHENTICATED', 'La sesión no es válida o venció.');
      }
      if (!user.enabled) {
        throw new AuthError(403, 'USER_DISABLED', 'La cuenta está deshabilitada.');
      }

      req.user = { id: user.id, displayName: user.displayName, role: user.role };
      next();
    } catch (error) {
      next(error);
    }
  };

  const requireRole =
    (...roles: Role[]): RequestHandler =>
    (req, _res, next) => {
      if (!req.user) {
        next(new AuthError(401, 'UNAUTHENTICATED', 'No hay una sesión activa.'));
        return;
      }
      if (!roles.includes(req.user.role)) {
        next(new AuthError(403, 'FORBIDDEN', 'No tienes permiso para esta operación.'));
        return;
      }
      next();
    };

  return { requireUser, requireRole };
}
