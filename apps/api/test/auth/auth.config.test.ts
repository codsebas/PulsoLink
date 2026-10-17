import { describe, expect, it } from 'vitest';
import { loadAuthConfigFromEnv } from '../../src/modules/auth/auth.config.js';

const DEV_CSRF_SECRET = 'pulsolink-dev-csrf-secret-key-32chars-min';

const BASE_ENV: NodeJS.ProcessEnv = {
  FIREBASE_WEB_API_KEY: 'test-api-key',
  CORS_ORIGIN: 'http://localhost:5173',
  CSRF_SECRET: 'test-csrf-secret-value-0123456789abcdef',
};

describe('loadAuthConfigFromEnv: COOKIE_SECURE', () => {
  it('sin COOKIE_SECURE definida deja cookieSecure = true', () => {
    const config = loadAuthConfigFromEnv({ ...BASE_ENV });
    expect(config.cookieSecure).toBe(true);
  });

  it('con COOKIE_SECURE=false deja cookieSecure = false', () => {
    const config = loadAuthConfigFromEnv({ ...BASE_ENV, COOKIE_SECURE: 'false' });
    expect(config.cookieSecure).toBe(false);
  });

  it('con COOKIE_SECURE=true deja cookieSecure = true', () => {
    const config = loadAuthConfigFromEnv({ ...BASE_ENV, COOKIE_SECURE: 'true' });
    expect(config.cookieSecure).toBe(true);
  });
});

describe('loadAuthConfigFromEnv: FIREBASE_WEB_API_KEY opcional', () => {
  it('sin FIREBASE_WEB_API_KEY no lanza y deja la clave vacía', () => {
    const { FIREBASE_WEB_API_KEY: _omitted, ...envWithoutKey } = BASE_ENV;
    const config = loadAuthConfigFromEnv(envWithoutKey);
    expect(config.firebaseWebApiKey).toBe('');
  });
});

describe('loadAuthConfigFromEnv: CORS_ORIGIN', () => {
  it('sin CORS_ORIGIN usa el origen de desarrollo predeterminado', () => {
    const { CORS_ORIGIN: _omitted, ...envWithoutOrigin } = BASE_ENV;
    const config = loadAuthConfigFromEnv(envWithoutOrigin);
    expect(config.appOrigins).toEqual(['http://localhost:5173']);
  });

  it('con dos orígenes separados por coma los acepta y normaliza', () => {
    const config = loadAuthConfigFromEnv({
      ...BASE_ENV,
      CORS_ORIGIN: 'http://localhost:5173, http://localhost:5174/',
    });
    expect(config.appOrigins).toEqual(['http://localhost:5173', 'http://localhost:5174']);
  });
});

describe('loadAuthConfigFromEnv: errores sin exponer valores', () => {
  it('con CSRF_SECRET corto el error menciona CSRF_SECRET y no el valor', () => {
    const shortSecret = 'abc1234567';
    let thrown: unknown;

    try {
      loadAuthConfigFromEnv({ ...BASE_ENV, CSRF_SECRET: shortSecret });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('CSRF_SECRET');
    expect(message).not.toContain(shortSecret);
  });

  it('en producción con el CSRF_SECRET de desarrollo el error nombra la variable sin su valor', () => {
    let thrown: unknown;

    try {
      loadAuthConfigFromEnv({
        ...BASE_ENV,
        NODE_ENV: 'production',
        CSRF_SECRET: DEV_CSRF_SECRET,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('CSRF_SECRET');
    expect(message).not.toContain(DEV_CSRF_SECRET);
  });
});
