import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { AuthError } from './auth.errors.js';

export const CSRF_COOKIE_NAME = 'pulsolink_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface CsrfConfig {
  /** Secreto de firma (CSRF_SECRET). */
  secret: string;
  /** Atributo Secure de la cookie CSRF. */
  secure: boolean;
  /** Orígenes permitidos para la cabecera Origin/Referer. */
  origins: string[];
}

export interface CsrfController {
  /** Garantiza la cookie y devuelve un token para el secreto actual. */
  getToken(req: Request, res: Response): string;
  /** Rota el secreto de la cookie y devuelve un token nuevo. */
  rotate(res: Response): string;
  /** Middleware que exige origen y token en las mutaciones. */
  csrfProtection: RequestHandler;
}

/**
 * Parser de cookies mínimo. Se usa como respaldo cuando la aplicación no montó
 * `cookie-parser`, de modo que los middlewares exportados funcionan igual.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) {
    return result;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key.length === 0) {
      continue;
    }
    let value = part.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

export function csrfCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', path: '/', secure };
}

function randomCookieSecret(): string {
  return randomBytes(32).toString('base64url');
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function issueToken(secret: string, cookieSecret: string): string {
  const nonce = randomBytes(16).toString('base64url');
  const signature = sign(secret, `${cookieSecret}.${nonce}`);
  return `${nonce}.${signature}`;
}

function verifyToken(secret: string, cookieSecret: string, token: string): boolean {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) {
    return false;
  }
  const nonce = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1), 'base64url');
  const expected = Buffer.from(sign(secret, `${cookieSecret}.${nonce}`), 'base64url');
  if (provided.length === 0 || provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

function originFromRequest(req: Request): string | null {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.length > 0) {
    return origin;
  }
  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer.length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

function invalidCsrf(): AuthError {
  return new AuthError(403, 'CSRF_INVALID', 'Origen no permitido o token CSRF inválido.');
}

/**
 * Double-submit firmado y ligado al navegador. La cookie `pulsolink_csrf`
 * contiene un secreto aleatorio; el token entregado al navegador es
 * `<nonce>.<HMAC-SHA256(CSRF_SECRET, secretoCookie + "." + nonce)>`. Rotar el
 * secreto (tras login/logout) invalida todos los tokens anteriores.
 */
export function createCsrf(config: CsrfConfig): CsrfController {
  const allowedOrigins = new Set(config.origins);

  const readCookieSecret = (req: Request): string | undefined => {
    const cookies =
      (req.cookies as Record<string, string> | undefined) ?? parseCookies(req.headers.cookie);
    return cookies[CSRF_COOKIE_NAME];
  };

  const getToken = (req: Request, res: Response): string => {
    let cookieSecret = readCookieSecret(req);
    if (!cookieSecret) {
      cookieSecret = randomCookieSecret();
      res.cookie(CSRF_COOKIE_NAME, cookieSecret, csrfCookieOptions(config.secure));
    }
    return issueToken(config.secret, cookieSecret);
  };

  const rotate = (res: Response): string => {
    const cookieSecret = randomCookieSecret();
    res.cookie(CSRF_COOKIE_NAME, cookieSecret, csrfCookieOptions(config.secure));
    return issueToken(config.secret, cookieSecret);
  };

  const csrfProtection: RequestHandler = (req, res, next) => {
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const origin = originFromRequest(req);
    if (origin === null || !allowedOrigins.has(origin)) {
      next(invalidCsrf());
      return;
    }

    const header = req.headers[CSRF_HEADER_NAME];
    const token = Array.isArray(header) ? header[0] : header;
    const cookieSecret = readCookieSecret(req);
    if (
      cookieSecret === undefined ||
      typeof token !== 'string' ||
      !verifyToken(config.secret, cookieSecret, token)
    ) {
      next(invalidCsrf());
      return;
    }

    next();
  };

  return { getToken, rotate, csrfProtection };
}
