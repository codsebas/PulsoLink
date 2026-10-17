import { z } from 'zod';

/**
 * Configuración del módulo de autenticación. `createAuthRouter` la recibe ya
 * construida y nunca lee `process.env` por su cuenta.
 */
export interface AuthConfig {
  /** Clave web del proyecto Firebase (para el endpoint REST de identidad). */
  firebaseWebApiKey: string;
  /** Orígenes de navegador permitidos (cabecera Origin/Referer). */
  appOrigins: string[];
  /** Secreto usado para firmar el token CSRF. Mínimo 32 caracteres. */
  csrfSecret: string;
  /** Atributo Secure de las cookies. true por defecto. */
  cookieSecure: boolean;
  /** Duración de la cookie de sesión en milisegundos. */
  sessionTtlMs: number;
  /** Límite de intentos de login. */
  loginRateLimit: { max: number; windowMs: number };
  /** Host del emulador de Firebase Auth (opcional). */
  firebaseAuthEmulatorHost?: string;
}

const DEFAULT_SESSION_TTL_HOURS = 8;
const DEFAULT_LOGIN_RATE_LIMIT_MAX = 10;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 900_000;
const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

/**
 * Valor de desarrollo del secreto CSRF. Coincide con el predeterminado de
 * `config/env.ts`. Usarlo en producción es un error de configuración.
 */
const DEV_CSRF_SECRET = 'pulsolink-dev-csrf-secret-key-32chars-min';

/**
 * Transforma una variable de entorno booleana. Por defecto `true`; solo pasa a
 * `false` si se declara exactamente "false" (tras recortar espacios). Un valor
 * distinto es un error.
 */
function booleanFromEnv(variable: string, defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === '') {
        return defaultValue;
      }
      const normalized = value.trim();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${variable} debe ser "true" o "false".`,
      });
      return z.NEVER;
    });
}

/**
 * Lista de orígenes separada por comas tomada de `CORS_ORIGIN`. Cada entrada se
 * normaliza a su origen canónico (sin ruta ni barra final). Los mensajes nunca
 * incluyen el valor.
 */
const originsFromEnv = z
  .string()
  .default(DEFAULT_CORS_ORIGIN)
  .transform((value, ctx) => {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CORS_ORIGIN debe declarar al menos un origen.',
      });
      return z.NEVER;
    }

    const origins = new Set<string>();
    for (const part of parts) {
      try {
        const url = new URL(part);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('protocolo no soportado');
        }
        origins.add(url.origin);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CORS_ORIGIN contiene un origen inválido.',
        });
        return z.NEVER;
      }
    }

    return Array.from(origins);
  });

const authEnvSchema = z
  .object({
    // Opcional en el arranque: la API debe poder iniciar sin credenciales para
    // health checks. Sin clave web, POST /login responde 503 AUTH_UNAVAILABLE.
    FIREBASE_WEB_API_KEY: z.string().trim().optional().default(''),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CORS_ORIGIN: originsFromEnv,
    CSRF_SECRET: z
      .string({ required_error: 'CSRF_SECRET debe tener al menos 32 caracteres.' })
      .min(32, 'CSRF_SECRET debe tener al menos 32 caracteres.')
      .default(DEV_CSRF_SECRET),
    COOKIE_SECURE: booleanFromEnv('COOKIE_SECURE', true),
    SESSION_TTL_HOURS: z.coerce
      .number({ invalid_type_error: 'SESSION_TTL_HOURS debe ser un número.' })
      .int('SESSION_TTL_HOURS debe ser un entero.')
      .positive('SESSION_TTL_HOURS debe ser mayor que cero.')
      .default(DEFAULT_SESSION_TTL_HOURS),
    LOGIN_RATE_LIMIT_MAX: z.coerce
      .number({ invalid_type_error: 'LOGIN_RATE_LIMIT_MAX debe ser un número.' })
      .int('LOGIN_RATE_LIMIT_MAX debe ser un entero.')
      .positive('LOGIN_RATE_LIMIT_MAX debe ser mayor que cero.')
      .default(DEFAULT_LOGIN_RATE_LIMIT_MAX),
    LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce
      .number({ invalid_type_error: 'LOGIN_RATE_LIMIT_WINDOW_MS debe ser un número.' })
      .int('LOGIN_RATE_LIMIT_WINDOW_MS debe ser un entero.')
      .positive('LOGIN_RATE_LIMIT_WINDOW_MS debe ser mayor que cero.')
      .default(DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && data.CSRF_SECRET === DEV_CSRF_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CSRF_SECRET no puede usar el valor de desarrollo en producción.',
      });
    }
  });

/**
 * Construye la configuración a partir del entorno. Si alguna variable falta o
 * es inválida, el error nombra la variable afectada y nunca su valor.
 */
export function loadAuthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    cleaned[key] = value === '' ? undefined : value;
  }

  const parsed = authEnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const messages = Array.from(new Set(parsed.error.issues.map((issue) => issue.message)));
    throw new Error(`Configuración de autenticación inválida:\n- ${messages.join('\n- ')}`);
  }

  const data = parsed.data;
  const emulatorHost = data.FIREBASE_AUTH_EMULATOR_HOST;

  return {
    firebaseWebApiKey: data.FIREBASE_WEB_API_KEY,
    appOrigins: data.CORS_ORIGIN,
    csrfSecret: data.CSRF_SECRET,
    cookieSecure: data.COOKIE_SECURE,
    sessionTtlMs: data.SESSION_TTL_HOURS * 60 * 60 * 1000,
    loginRateLimit: {
      max: data.LOGIN_RATE_LIMIT_MAX,
      windowMs: data.LOGIN_RATE_LIMIT_WINDOW_MS,
    },
    ...(emulatorHost ? { firebaseAuthEmulatorHost: emulatorHost } : {}),
  };
}
