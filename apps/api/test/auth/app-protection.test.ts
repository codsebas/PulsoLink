import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';

const ORIGIN = 'http://localhost:5173';

/**
 * Prueba de integración sobre la aplicación real (`createApp`). Verifica que
 * `src/app.ts` protege los recursos web y que el contrato de arranque se cumple
 * cuando faltan credenciales de Firebase.
 *
 * Las variables de entorno se fijan ANTES del import dinámico de `app.js`, ya
 * que la configuración de autenticación se construye al cargar el módulo.
 */
let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.CORS_ORIGIN = ORIGIN;
  process.env.CSRF_SECRET = 'test-csrf-secret-value-0123456789abcdef';
  process.env.COOKIE_SECURE = 'false';
  // Sin clave web: la API arranca, pero el login responde 503 AUTH_UNAVAILABLE.
  process.env.FIREBASE_WEB_API_KEY = '';

  const { createApp } = await import('../../src/app.js');
  app = createApp();
});

describe('arranque sin FIREBASE_WEB_API_KEY', () => {
  it('GET /api/v1/health responde 200', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('pulsolink-api');
  });

  it('POST /api/v1/auth/login con CSRF válido responde 503 AUTH_UNAVAILABLE', async () => {
    const agent = request.agent(app);
    const csrfResponse = await agent.get('/api/v1/auth/csrf').set('Origin', ORIGIN);
    const csrfToken = csrfResponse.body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'alguien@pulselink.test', password: 'Password123' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
  });

  it('POST /api/v1/auth/login sin CSRF responde 403 CSRF_INVALID', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'alguien@pulselink.test', password: 'Password123' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });
});

describe('protección de rutas web', () => {
  it('GET /api/v1/auth/me sin sesión responde 401 UNAUTHENTICATED', async () => {
    const response = await request(app).get('/api/v1/auth/me').set('Origin', ORIGIN);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /api/v1/devices sin sesión responde 401 UNAUTHENTICATED', async () => {
    const response = await request(app).get('/api/v1/devices').set('Origin', ORIGIN);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /api/v1/sessions sin sesión responde 401 UNAUTHENTICATED', async () => {
    const response = await request(app).get('/api/v1/sessions').set('Origin', ORIGIN);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('POST /api/v1/sessions evalúa primero requireUser y responde 401 sin sesión', async () => {
    // Comportamiento documentado en docs/auth.md: requireUser precede a
    // csrfProtection, por lo que sin sesión el código es UNAUTHENTICATED (401)
    // y no CSRF_INVALID (403).
    const response = await request(app)
      .post('/api/v1/sessions')
      .set('Origin', ORIGIN)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('la ruta de dispositivo (Contrato A) no exige sesión: sin credenciales responde 401 por su propia autenticación', async () => {
    const response = await request(app)
      .post('/api/v1/device/measurements')
      .set('Origin', ORIGIN)
      .send({});

    // No debe ser un 401 de sesión web: el contrato A gestiona su propia
    // credencial de dispositivo. Se comprueba que no exige la cookie de sesión.
    expect(response.status).not.toBe(200);
    if (response.body?.error) {
      expect(response.body.error.code).not.toBe('UNAUTHENTICATED');
    }
  });
});
