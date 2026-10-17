import type { RequestHandler } from 'express';
import { AuthError } from './auth.errors.js';

export interface LoginRateLimitOptions {
  /** Número máximo de intentos permitidos dentro de la ventana. */
  max: number;
  /** Duración de la ventana en milisegundos. */
  windowMs: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * Limitador de intentos de login en memoria, con ventana fija por IP. Sustituye
 * a `express-rate-limit` (dependencia no incluida en el monorepositorio) sin
 * añadir paquetes. Se instancia dentro de `createAuthRouter`, de modo que su
 * estado se aísla por aplicación.
 *
 * Al superar el límite responde con la cabecera `Retry-After` (segundos) y un
 * `AuthError` 429 TOO_MANY_ATTEMPTS que el manejador global traduce.
 */
export function createLoginRateLimiter(options: LoginRateLimitOptions): RequestHandler {
  const hits = new Map<string, WindowEntry>();

  const pruneExpired = (now: number): void => {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) {
        hits.delete(key);
      }
    }
  };

  return (req, res, next) => {
    const now = Date.now();
    pruneExpired(now);

    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const entry = hits.get(key);

    if (entry && entry.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(
        new AuthError(
          429,
          'TOO_MANY_ATTEMPTS',
          'Demasiados intentos de inicio de sesión. Inténtalo más tarde.',
        ),
      );
      return;
    }

    if (entry) {
      entry.count += 1;
    } else {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
    }

    next();
  };
}
