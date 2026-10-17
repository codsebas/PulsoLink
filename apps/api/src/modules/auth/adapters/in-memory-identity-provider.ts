import { AuthError } from '../auth.errors.js';
import type { IdentityProvider, VerifiedCredentials } from '../auth.types.js';

export interface InMemoryUserSeed {
  email: string;
  password: string;
  uid: string;
}

export interface InMemoryIdentityProviderOptions {
  users: InMemoryUserSeed[];
  /** Fuerza AUTH_UNAVAILABLE en toda verificación. */
  forceUnavailable?: boolean;
  /** Fuerza TOO_MANY_ATTEMPTS en toda verificación. */
  forceTooManyAttempts?: boolean;
}

/**
 * Adaptador en memoria del puerto de identidad para pruebas y desarrollo.
 * `idToken` y cookie llevan un prefijo `fake-` para dejar claro que no son
 * credenciales reales.
 */
export class InMemoryIdentityProvider implements IdentityProvider {
  private readonly usersByEmail = new Map<string, InMemoryUserSeed>();
  private readonly revokedUids = new Set<string>();
  private readonly sessions = new Map<string, string>();

  private readonly forceUnavailable: boolean;
  private readonly forceTooManyAttempts: boolean;

  constructor(options: InMemoryIdentityProviderOptions) {
    for (const user of options.users) {
      this.usersByEmail.set(user.email.trim().toLowerCase(), user);
    }
    this.forceUnavailable = options.forceUnavailable ?? false;
    this.forceTooManyAttempts = options.forceTooManyAttempts ?? false;
  }

  async verifyPassword(email: string, password: string): Promise<VerifiedCredentials> {
    if (this.forceUnavailable) {
      throw new AuthError(
        503,
        'AUTH_UNAVAILABLE',
        'El servicio de autenticación no está disponible.',
      );
    }
    if (this.forceTooManyAttempts) {
      throw new AuthError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Inténtalo más tarde.');
    }

    const user = this.usersByEmail.get(email.trim().toLowerCase());
    if (!user || user.password !== password) {
      throw new AuthError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }

    return { uid: user.uid, idToken: `fake-id:${user.uid}` };
  }

  async createSessionCookie(idToken: string, _expiresInMs: number): Promise<string> {
    if (!idToken.startsWith('fake-id:')) {
      throw new AuthError(401, 'UNAUTHENTICATED', 'La sesión no es válida o venció.');
    }
    const uid = idToken.slice('fake-id:'.length);
    if (uid.length === 0 || this.revokedUids.has(uid)) {
      throw new AuthError(401, 'UNAUTHENTICATED', 'La sesión no es válida o venció.');
    }
    const cookie = `fake-session:${uid}`;
    this.sessions.set(cookie, uid);
    return cookie;
  }

  async verifySessionCookie(cookie: string): Promise<{ uid: string }> {
    if (!cookie.startsWith('fake-session:')) {
      throw new AuthError(401, 'UNAUTHENTICATED', 'La sesión no es válida o venció.');
    }
    const uid = cookie.slice('fake-session:'.length);
    if (uid.length === 0 || this.revokedUids.has(uid)) {
      throw new AuthError(401, 'UNAUTHENTICATED', 'La sesión no es válida o venció.');
    }
    return { uid };
  }

  /** Simula la revocación global de las sesiones de un usuario. */
  revoke(uid: string): void {
    this.revokedUids.add(uid);
    for (const [cookie, sessionUid] of this.sessions) {
      if (sessionUid === uid) {
        this.sessions.delete(cookie);
      }
    }
  }
}
