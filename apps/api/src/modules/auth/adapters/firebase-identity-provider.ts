import { getAuth } from '../../../config/firebase.js';
import { AuthError } from '../auth.errors.js';
import type { AuthConfig } from '../auth.config.js';
import type { IdentityProvider, VerifiedCredentials } from '../auth.types.js';

const IDENTITY_BASE_URL = 'https://identitytoolkit.googleapis.com';
const EMULATOR_BASE_PATH = '/identitytoolkit.googleapis.com';

export interface FirebaseIdentityProviderOptions {
  /** Clave web de Firebase (FIREBASE_WEB_API_KEY). */
  apiKey: string;
  /** Host del emulador, por ejemplo "127.0.0.1:9099". */
  emulatorHost?: string;
  /** `fetch` inyectable para pruebas; por defecto el global. */
  fetch?: typeof globalThis.fetch;
}

interface FirebaseErrorBody {
  error?: { message?: unknown };
}

function unavailable(): AuthError {
  return new AuthError(
    503,
    'AUTH_UNAVAILABLE',
    'El servicio de autenticación no está disponible.',
  );
}

/** El Admin SDK no pudo inicializarse (falta de credenciales). */
function isFirebaseNotConfigured(error: unknown): boolean {
  return error instanceof Error && error.message.includes('FIREBASE_NOT_CONFIGURED');
}

function mapFirebaseAuthError(message: string): AuthError {
  const code = message.split(':')[0]?.trim() ?? '';
  switch (code) {
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_PASSWORD':
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'USER_DISABLED':
    case 'INVALID_EMAIL':
      return new AuthError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return new AuthError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Demasiados intentos. Inténtalo más tarde.',
      );
    default:
      return unavailable();
  }
}

/**
 * Adaptador real del puerto de identidad. La verificación de credenciales usa
 * el endpoint REST de Firebase Auth; la creación y verificación de cookies usa
 * el Admin SDK inicializado por `config/firebase.ts`. Nunca devuelve tokens ni
 * contraseñas fuera de este módulo.
 */
export class FirebaseIdentityProvider implements IdentityProvider {
  private readonly apiKey: string;
  private readonly emulatorHost?: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: FirebaseIdentityProviderOptions) {
    this.apiKey = options.apiKey;
    this.emulatorHost = options.emulatorHost;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  private identityBaseUrl(): string {
    if (this.emulatorHost) {
      return `http://${this.emulatorHost}${EMULATOR_BASE_PATH}`;
    }
    return IDENTITY_BASE_URL;
  }

  async verifyPassword(email: string, password: string): Promise<VerifiedCredentials> {
    // Sin clave web configurada no hay servicio de identidad: la API arranca
    // igualmente (health checks) y el login responde 503 AUTH_UNAVAILABLE.
    if (this.apiKey.trim().length === 0) {
      throw unavailable();
    }

    const url = `${this.identityBaseUrl()}/v1/accounts:signInWithPassword?key=${this.apiKey}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
    } catch {
      throw unavailable();
    }

    if (response.status >= 500) {
      throw unavailable();
    }

    const body = (await response.json().catch(() => null)) as
      | { localId?: unknown; idToken?: unknown }
      | null;

    if (!response.ok) {
      const rawMessage =
        body && typeof body === 'object' && 'error' in body
          ? (body as FirebaseErrorBody).error?.message
          : undefined;
      const message = typeof rawMessage === 'string' ? rawMessage : '';
      throw mapFirebaseAuthError(message);
    }

    if (
      !body ||
      typeof body.localId !== 'string' ||
      typeof body.idToken !== 'string' ||
      body.localId.length === 0
    ) {
      throw unavailable();
    }

    return { uid: body.localId, idToken: body.idToken };
  }

  async createSessionCookie(idToken: string, expiresInMs: number): Promise<string> {
    try {
      return await getAuth().createSessionCookie(idToken, { expiresIn: expiresInMs });
    } catch {
      // Incluye FIREBASE_NOT_CONFIGURED y errores del Admin SDK: nunca se
      // exponen detalles, solo un 503 genérico.
      throw unavailable();
    }
  }

  async verifySessionCookie(cookie: string): Promise<{ uid: string }> {
    try {
      const decoded = await getAuth().verifySessionCookie(cookie, true);
      return { uid: decoded.uid };
    } catch (error) {
      if (isFirebaseNotConfigured(error)) {
        throw unavailable();
      }
      throw new AuthError(401, 'UNAUTHENTICATED', 'La sesión no es válida o venció.');
    }
  }
}

/**
 * Conveniencia para el equipo: construye el proveedor a partir de la config ya
 * cargada, evitando re-leer variables de entorno.
 */
export function createFirebaseIdentityProvider(
  config: Pick<AuthConfig, 'firebaseWebApiKey' | 'firebaseAuthEmulatorHost'>,
  fetchImpl?: typeof globalThis.fetch,
): FirebaseIdentityProvider {
  return new FirebaseIdentityProvider({
    apiKey: config.firebaseWebApiKey,
    ...(config.firebaseAuthEmulatorHost ? { emulatorHost: config.firebaseAuthEmulatorHost } : {}),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}
