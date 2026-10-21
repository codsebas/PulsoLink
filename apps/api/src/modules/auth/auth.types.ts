import type { UserRole } from '../../shared/types.js';

/** Rol de aplicación, alineado con `shared/types.ts` (única fuente de verdad). */
export type Role = UserRole;

export interface AuthUser {
  id: string;
  displayName: string;
  role: Role;
}

export interface AppUser extends AuthUser {
  enabled: boolean;
}

export interface VerifiedCredentials {
  uid: string;
  idToken: string;
}

export interface IdentityUser {
  uid: string;
  email: string | null;
  disabled: boolean;
}

export interface CreateIdentityInput {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  role: Role;
}

export interface UpdateIdentityInput {
  displayName?: string;
  disabled?: boolean;
  role?: Role;
}

/**
 * Puerto de identidad. El adaptador de Firebase implementa la verificación de
 * credenciales contra Firebase Auth REST y la gestión de cookies de sesión con
 * el Admin SDK. Los adaptadores en memoria lo implementan para pruebas.
 */
export interface IdentityProvider {
  /**
   * Verifica correo/contraseña. Lanza AuthError con código
   * INVALID_CREDENTIALS | TOO_MANY_ATTEMPTS | AUTH_UNAVAILABLE.
   */
  verifyPassword(email: string, password: string): Promise<VerifiedCredentials>;
  createSessionCookie(idToken: string, expiresInMs: number): Promise<string>;
  /**
   * Comprueba firma, vencimiento y revocación. Lanza AuthError UNAUTHENTICATED
   * si la cookie no es válida.
   */
  verifySessionCookie(cookie: string): Promise<{ uid: string }>;
  /** Operaciones administrativas usadas por el CRUD de usuarios. */
  createIdentity(input: CreateIdentityInput): Promise<void>;
  findIdentityByEmail(email: string): Promise<IdentityUser | null>;
  getIdentity(uid: string): Promise<IdentityUser | null>;
  updateIdentity(uid: string, input: UpdateIdentityInput): Promise<void>;
  revokeSessions(uid: string): Promise<void>;
}

export interface UserRepository {
  findById(uid: string): Promise<AppUser | null>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
