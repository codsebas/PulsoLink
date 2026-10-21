import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthConfig } from '../../src/modules/auth/auth.config.js';
import { createAuthMiddleware } from '../../src/modules/auth/auth.middleware.js';
import { createAuthRouter } from '../../src/modules/auth/auth.router.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { InMemoryIdentityProvider } from '../../src/modules/auth/adapters/in-memory-identity-provider.js';
import { InMemoryUserRepository } from '../../src/modules/auth/adapters/in-memory-user-repository.js';
import type { AuditRepository } from '../../src/modules/audit/audit.repository.js';

const ORIGIN = 'http://localhost:5173';
const CSRF_SECRET = 'test-csrf-secret-value-0123456789abcdef';
const ADMIN = { email: 'admin@pulselink.test', password: 'AdminPass123', uid: 'uid-admin' };
const OPERATOR = {
  email: 'operador@pulselink.test',
  password: 'OperadorPass123',
  uid: 'uid-operador',
};
const DISABLED = {
  email: 'deshabilitado@pulselink.test',
  password: 'DisabledPass123',
  uid: 'uid-deshabilitado',
};

type Agent = ReturnType<typeof request.agent>;
interface Credentials {
  email: string;
  password: string;
}

function makeConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    firebaseWebApiKey: 'test-api-key',
    appOrigins: [ORIGIN],
    csrfSecret: CSRF_SECRET,
    // Las pruebas corren sobre HTTP; el atributo Secure se verifica aparte.
    cookieSecure: false,
    sessionTtlMs: 8 * 60 * 60 * 1000,
    loginRateLimit: { max: 10, windowMs: 900_000 },
    ...overrides,
  };
}

function seedUsers(repository: InMemoryUserRepository): void {
  repository.set({ id: ADMIN.uid, displayName: 'Admin', role: 'admin', enabled: true });
  repository.set({ id: OPERATOR.uid, displayName: 'Operador', role: 'viewer', enabled: true });
  repository.set({
    id: DISABLED.uid,
    displayName: 'Deshabilitado',
    role: 'viewer',
    enabled: false,
  });
}

interface TestAppOptions {
  config?: AuthConfig;
  identityProvider?: InMemoryIdentityProvider;
  userRepository?: InMemoryUserRepository;
  auditRepository?: Pick<AuditRepository, 'append'>;
}

/**
 * Replica el orden de `src/app.ts`: parser JSON (8 KiB), cookie-parser, router de
 * autenticación, middlewares reutilizables y manejador global de errores.
 */
function createTestApp(options: TestAppOptions = {}) {
  const identityProvider =
    options.identityProvider ?? new InMemoryIdentityProvider({ users: [ADMIN, OPERATOR, DISABLED] });
  const userRepository = options.userRepository ?? new InMemoryUserRepository();
  if (!options.userRepository) {
    seedUsers(userRepository);
  }
  const config = options.config ?? makeConfig();

  const app = express();
  app.use(express.json({ limit: '8kb' }));
  app.use(cookieParser());
  const auditRepository = options.auditRepository ?? { append: vi.fn(async () => ({}) as never) };
  app.use('/api/v1/auth', createAuthRouter({ config, identityProvider, userRepository, auditRepository }));
  const { requireUser, requireRole } = createAuthMiddleware({ identityProvider, userRepository });
  app.get('/api/v1/test/admin', requireUser, requireRole('admin'), (req, res) => {
    res.json({ data: req.user });
  });
  app.use(errorHandler);

  return { app, identityProvider, userRepository, config, auditRepository };
}

function setCookies(response: request.Response): string[] {
  const raw = response.headers['set-cookie'] as string | string[] | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function findCookie(response: request.Response, name: string): string | undefined {
  return setCookies(response).find((cookie) => cookie.startsWith(`${name}=`));
}

function cookieValue(response: request.Response, name: string): string | undefined {
  const cookie = findCookie(response, name);
  if (!cookie) return undefined;
  const pair = cookie.split(';')[0] ?? '';
  return pair.slice(pair.indexOf('=') + 1);
}

async function getCsrfToken(agent: Agent): Promise<string> {
  const response = await agent.get('/api/v1/auth/csrf').set('Origin', ORIGIN);
  return response.body.data.csrfToken as string;
}

function login(agent: Agent, credentials: Credentials) {
  return getCsrfToken(agent).then((token) =>
    agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', token)
      .send({ email: credentials.email, password: credentials.password }),
  );
}

describe('GET /csrf', () => {
  it('devuelve data.csrfToken y establece la cookie HttpOnly', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/v1/auth/csrf');

    expect(response.status).toBe(200);
    expect(typeof response.body.data.csrfToken).toBe('string');
    expect(response.body.data.csrfToken.length).toBeGreaterThan(0);

    const cookie = findCookie(response, 'pulsolink_csrf');
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });
});

describe('POST /login: CSRF y origen', () => {
  it('sin X-CSRF-Token responde 403 CSRF_INVALID', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    await getCsrfToken(agent);

    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: ADMIN.email, password: ADMIN.password });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('con token válido pero origen no permitido responde 403 CSRF_INVALID', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    const token = await getCsrfToken(agent);

    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', 'http://evil.test')
      .set('X-CSRF-Token', token)
      .send({ email: ADMIN.email, password: ADMIN.password });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('sin Origin ni Referer responde 403 CSRF_INVALID', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    const token = await getCsrfToken(agent);

    const response = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: ADMIN.email, password: ADMIN.password });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });
});

describe('POST /login: validación', () => {
  it('con cuerpo inválido responde 400 VALIDATION_ERROR', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);

    const response = await login(agent, { email: 'no-es-correo', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('con un campo role extra responde 400 VALIDATION_ERROR', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    const token = await getCsrfToken(agent);

    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', token)
      .send({ email: ADMIN.email, password: ADMIN.password, role: 'admin' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('con JSON malformado responde 400 VALIDATION_ERROR con requestId', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    const token = await getCsrfToken(agent);

    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', token)
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('El cuerpo de la petición no es JSON válido.');
    expect(typeof response.body.error.requestId).toBe('string');
    expect(response.body.error.requestId.length).toBeGreaterThan(0);
  });

  it('con un cuerpo mayor a 8 KiB responde 413 PAYLOAD_TOO_LARGE', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    const token = await getCsrfToken(agent);

    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', token)
      .send({ email: ADMIN.email, password: ADMIN.password, padding: 'a'.repeat(9 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('contraseña incorrecta y correo inexistente dan el mismo 401', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);

    const wrongPassword = await login(agent, {
      email: ADMIN.email,
      password: 'IncorrectPass1',
    });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');

    const unknownEmail = await login(agent, {
      email: 'nadie@pulselink.test',
      password: 'Whatever123',
    });
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });
});

describe('POST /login: éxito', () => {
  it('responde 200 con el usuario y sin idToken', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);

    const response = await login(agent, ADMIN);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: ADMIN.uid,
      displayName: 'Admin',
      role: 'admin',
    });
    expect(response.body.data.idToken).toBeUndefined();
    expect(response.body.data.uid).toBeUndefined();
  });

  it('establece la cookie de sesión con los atributos y Max-Age acordados', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);

    const response = await login(agent, ADMIN);
    const cookie = findCookie(response, 'pulsolink_session');

    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=28800');
  });

  it('rota el CSRF: el token anterior ya no sirve para /logout', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    const oldToken = await getCsrfToken(agent);

    const loginResponse = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', oldToken)
      .send({ email: ADMIN.email, password: ADMIN.password });
    expect(loginResponse.status).toBe(200);

    const logoutResponse = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', oldToken);
    expect(logoutResponse.status).toBe(403);
    expect(logoutResponse.body.error.code).toBe('CSRF_INVALID');
  });

  it('usuario deshabilitado responde 403 USER_DISABLED sin cookie de sesión', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);

    const response = await login(agent, DISABLED);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('USER_DISABLED');
    expect(findCookie(response, 'pulsolink_session')).toBeUndefined();
  });

  it('usuario autenticado en Firebase pero sin documento responde 401 sin cookie', async () => {
    const ghost = { email: 'fantasma@pulselink.test', password: 'GhostPass123', uid: 'uid-fantasma' };
    const identityProvider = new InMemoryIdentityProvider({ users: [ghost] });
    const userRepository = new InMemoryUserRepository();
    const { app } = createTestApp({ identityProvider, userRepository });
    const agent = request.agent(app);

    const response = await login(agent, ghost);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(findCookie(response, 'pulsolink_session')).toBeUndefined();
  });
});

describe('auditoría de login', () => {
  it('registra el éxito con el actor verificado y no expone credenciales', async () => {
    const append = vi.fn(async () => ({}) as never);
    const { app } = createTestApp({ auditRepository: { append } });
    const agent = request.agent(app);

    expect((await login(agent, ADMIN)).status).toBe(200);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      actorId: ADMIN.uid,
      action: 'auth.login',
      targetType: 'auth',
      targetId: ADMIN.uid,
      result: 'success',
    }), expect.any(String));
    expect(JSON.stringify(append.mock.calls)).not.toContain(ADMIN.password);
  });

  it('registra el fallo como anonymous sin copiar el correo', async () => {
    const append = vi.fn(async () => ({}) as never);
    const { app } = createTestApp({ auditRepository: { append } });
    const agent = request.agent(app);

    expect((await login(agent, { ...ADMIN, password: 'Incorrecta123' })).status).toBe(401);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'anonymous',
      action: 'auth.login',
      result: 'failure',
    }), expect.any(String));
    expect(JSON.stringify(append.mock.calls)).not.toContain(ADMIN.email);
  });

  it('no entrega la sesión si falla la auditoría obligatoria', async () => {
    const append = vi.fn(async () => { throw new Error('audit down'); });
    const { app } = createTestApp({ auditRepository: { append } });
    const agent = request.agent(app);
    const response = await login(agent, ADMIN);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AUDIT_UNAVAILABLE');
    expect(findCookie(response, 'pulsolink_session')).toBeUndefined();
  });
});

describe('GET /me', () => {
  it('sin cookie responde 401', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/v1/auth/me').set('Origin', ORIGIN);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('con sesión responde 200 con el usuario', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    await login(agent, OPERATOR);

    const response = await agent.get('/api/v1/auth/me').set('Origin', ORIGIN);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: OPERATOR.uid,
      displayName: 'Operador',
      role: 'viewer',
    });
  });

  it('con la sesión revocada responde 401', async () => {
    const { app, identityProvider } = createTestApp();
    const agent = request.agent(app);
    await login(agent, OPERATOR);

    identityProvider.revoke(OPERATOR.uid);
    const response = await agent.get('/api/v1/auth/me').set('Origin', ORIGIN);

    expect(response.status).toBe(401);
  });
});

describe('POST /logout', () => {
  it('responde 204, borra la cookie y luego /me da 401', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    await login(agent, ADMIN);
    const token = await getCsrfToken(agent);

    const logoutResponse = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', token);

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.text).toBeFalsy();

    const me = await agent.get('/api/v1/auth/me').set('Origin', ORIGIN);
    expect(me.status).toBe(401);
  });

  it('sin sesión también responde 204 (idempotente)', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    const token = await getCsrfToken(agent);

    const response = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', token);

    expect(response.status).toBe(204);
  });
});

describe('requireRole', () => {
  it('operador en ruta de admin responde 403 y admin responde 200', async () => {
    const { app } = createTestApp();

    const operatorAgent = request.agent(app);
    await login(operatorAgent, OPERATOR);
    const forbidden = await operatorAgent.get('/api/v1/test/admin').set('Origin', ORIGIN);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const adminAgent = request.agent(app);
    await login(adminAgent, ADMIN);
    const allowed = await adminAgent.get('/api/v1/test/admin').set('Origin', ORIGIN);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.role).toBe('admin');
  });
});

describe('rate limit de login', () => {
  it('el tercer intento responde 429 con cabecera Retry-After', async () => {
    const { app } = createTestApp({
      config: makeConfig({ loginRateLimit: { max: 2, windowMs: 900_000 } }),
    });
    const agent = request.agent(app);
    const badCredentials = { email: ADMIN.email, password: 'IncorrectPass1' };

    const first = await login(agent, badCredentials);
    expect(first.status).toBe(401);
    const second = await login(agent, badCredentials);
    expect(second.status).toBe(401);

    const third = await login(agent, badCredentials);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(third.headers['retry-after']).toBeDefined();
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('formato de error', () => {
  it('toda respuesta de error incluye code, message y requestId', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(typeof response.body.error.code).toBe('string');
    expect(typeof response.body.error.message).toBe('string');
    expect(typeof response.body.error.requestId).toBe('string');
    expect(response.body.error.requestId.length).toBeGreaterThan(0);
  });

  it('reutiliza la cabecera x-request-id cuando existe', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/v1/auth/me').set('X-Request-Id', 'req-prueba-1');

    expect(response.body.error.requestId).toBe('req-prueba-1');
  });
});

describe('atributo Secure de las cookies', () => {
  async function loginWithSecureCookies(secure: boolean) {
    const { app } = createTestApp({ config: makeConfig({ cookieSecure: secure }) });
    // El jar de supertest no reenvía cookies Secure sobre HTTP; se reenvía
    // manualmente la cookie CSRF obtenida en GET /csrf.
    const csrfResponse = await request(app).get('/api/v1/auth/csrf').set('Origin', ORIGIN);
    const csrfValue = cookieValue(csrfResponse, 'pulsolink_csrf');
    const csrfToken = csrfResponse.body.data.csrfToken as string;

    return request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', `pulsolink_csrf=${csrfValue}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: ADMIN.email, password: ADMIN.password });
  }

  it('COOKIE_SECURE=true incluye Secure', async () => {
    const response = await loginWithSecureCookies(true);

    expect(response.status).toBe(200);
    expect(findCookie(response, 'pulsolink_session')).toContain('Secure');
    expect(findCookie(response, 'pulsolink_csrf')).toContain('Secure');
  });

  it('COOKIE_SECURE=false no incluye Secure', async () => {
    const response = await loginWithSecureCookies(false);

    expect(response.status).toBe(200);
    expect(findCookie(response, 'pulsolink_session')).not.toContain('Secure');
  });
});
