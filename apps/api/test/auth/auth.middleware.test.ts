import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthMiddleware } from '../../src/modules/auth/auth.middleware.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { InMemoryIdentityProvider } from '../../src/modules/auth/adapters/in-memory-identity-provider.js';
import { InMemoryUserRepository } from '../../src/modules/auth/adapters/in-memory-user-repository.js';

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

function build(options: { withCookieParser?: boolean } = {}) {
  const identityProvider = new InMemoryIdentityProvider({
    users: [ADMIN, OPERATOR, DISABLED],
  });
  const userRepository = new InMemoryUserRepository();
  userRepository.set({ id: ADMIN.uid, displayName: 'Admin', role: 'admin', enabled: true });
  userRepository.set({ id: OPERATOR.uid, displayName: 'Operador', role: 'operator', enabled: true });
  userRepository.set({
    id: DISABLED.uid,
    displayName: 'Deshabilitado',
    role: 'operator',
    enabled: false,
  });

  const { requireUser, requireRole } = createAuthMiddleware({ identityProvider, userRepository });

  const app = express();
  if (options.withCookieParser) {
    app.use(cookieParser());
  }
  app.get('/protegido', requireUser, (req, res) => {
    res.json({ data: req.user });
  });
  app.get('/solo-admin', requireUser, requireRole('admin'), (req, res) => {
    res.json({ data: req.user });
  });
  app.get('/solo-rol', requireRole('admin'), (req, res) => {
    res.json({ data: req.user });
  });
  app.use(errorHandler);

  return { app, identityProvider, userRepository };
}

describe('requireUser', () => {
  it('sin cookie responde 401 UNAUTHENTICATED', async () => {
    const { app } = build();
    const response = await request(app).get('/protegido');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('con cookie inválida responde 401', async () => {
    const { app } = build();
    const response = await request(app).get('/protegido').set('Cookie', 'pulsolink_session=basura');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('con sesión válida asigna req.user sin el campo enabled', async () => {
    const { app } = build();
    const response = await request(app)
      .get('/protegido')
      .set('Cookie', `pulsolink_session=fake-session:${OPERATOR.uid}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: OPERATOR.uid,
      displayName: 'Operador',
      role: 'operator',
    });
    expect(response.body.data.enabled).toBeUndefined();
  });

  it('con usuario deshabilitado responde 403 USER_DISABLED', async () => {
    const { app } = build();
    const response = await request(app)
      .get('/protegido')
      .set('Cookie', `pulsolink_session=fake-session:${DISABLED.uid}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('USER_DISABLED');
  });

  it('con usuario sin documento responde 401', async () => {
    const { app } = build();
    const response = await request(app)
      .get('/protegido')
      .set('Cookie', 'pulsolink_session=fake-session:uid-inexistente');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('lee la cookie aunque la app no monte cookie-parser', async () => {
    const { app } = build({ withCookieParser: false });
    const response = await request(app)
      .get('/protegido')
      .set('Cookie', `pulsolink_session=fake-session:${ADMIN.uid}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(ADMIN.uid);
  });
});

describe('requireRole', () => {
  it('sin usuario responde 401', async () => {
    const { app } = build();
    const response = await request(app).get('/solo-rol');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('con rol insuficiente responde 403 FORBIDDEN', async () => {
    const { app } = build();
    const response = await request(app)
      .get('/solo-admin')
      .set('Cookie', `pulsolink_session=fake-session:${OPERATOR.uid}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('con rol adecuado deja pasar', async () => {
    const { app } = build();
    const response = await request(app)
      .get('/solo-admin')
      .set('Cookie', `pulsolink_session=fake-session:${ADMIN.uid}`);

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('admin');
  });
});
