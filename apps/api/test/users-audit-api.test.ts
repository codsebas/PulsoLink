import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createAuthRouter } from '../src/modules/auth/auth.router.js';
import { createAuthMiddleware } from '../src/modules/auth/auth.middleware.js';
import { createCsrf } from '../src/modules/auth/csrf.js';
import { InMemoryIdentityProvider } from '../src/modules/auth/adapters/in-memory-identity-provider.js';
import { InMemoryUserRepository } from '../src/modules/auth/adapters/in-memory-user-repository.js';
import { createUsersRouter } from '../src/modules/users/users.routes.js';
import { userDto, type UserDocument } from '../src/modules/users/users.repository.js';
import type { UsersService } from '../src/modules/users/users.service.js';
import { createAuditRouter } from '../src/modules/audit/audit.routes.js';
import type { AuditDocument, AuditRepository } from '../src/modules/audit/audit.repository.js';

const origin = 'http://localhost:5173';
const admin = { uid: 'admin-users', email: 'admin-users@test.local', password: 'Password123' };
const viewer = { uid: 'viewer-users', email: 'viewer-users@test.local', password: 'Password123' };

const target: UserDocument = {
  uid: 'target-user',
  displayName: 'Usuario Objetivo',
  role: 'viewer',
  enabled: true,
  createdAt: '2026-10-18T00:00:00.000Z',
};

const event: AuditDocument = {
  id: 'audit-1',
  actorId: admin.uid,
  action: 'user.create',
  targetType: 'user',
  targetId: target.uid,
  occurredAt: '2026-10-18T00:00:00.000Z',
  result: 'success',
  context: {},
};

function setup() {
  const identityProvider = new InMemoryIdentityProvider({ users: [admin, viewer] });
  const userRepository = new InMemoryUserRepository();
  userRepository.set({ id: admin.uid, displayName: 'Admin', role: 'admin', enabled: true });
  userRepository.set({ id: viewer.uid, displayName: 'Viewer', role: 'viewer', enabled: true });
  const config = {
    firebaseWebApiKey: 'test',
    appOrigins: [origin],
    csrfSecret: 'test-csrf-secret-value-0123456789abcdef',
    cookieSecure: false,
    sessionTtlMs: 8 * 60 * 60 * 1000,
    loginRateLimit: { max: 100, windowMs: 900_000 },
  };
  const usersService = {
    list: vi.fn(async () => ({ data: [target], pagination: { nextCursor: null, hasMore: false } })),
    get: vi.fn(async () => userDto(target)),
    create: vi.fn(async () => userDto(target)),
    update: vi.fn(async () => userDto(target)),
  };
  const auditRepository = {
    list: vi.fn(async () => ({ data: [event], pagination: { nextCursor: null, hasMore: false } })),
  };
  const app = express();
  app.use(express.json({ limit: '8kb' }), cookieParser());
  app.use('/api/v1/auth', createAuthRouter({
    config,
    identityProvider,
    userRepository,
    auditRepository: { append: vi.fn(async () => ({}) as never) },
  }));
  const { csrfProtection } = createCsrf({ secret: config.csrfSecret, secure: false, origins: [origin] });
  const { requireUser, requireRole } = createAuthMiddleware({ identityProvider, userRepository });
  app.use('/api/v1/users', requireUser, csrfProtection, createUsersRouter(usersService as unknown as UsersService));
  app.use('/api/v1/audit-logs', requireUser, requireRole('admin'),
    createAuditRouter(auditRepository as unknown as AuditRepository));
  app.use(errorHandler);

  async function login(user: typeof admin) {
    const agent = request.agent(app);
    const csrfResponse = await agent.get('/api/v1/auth/csrf');
    const response = await agent.post('/api/v1/auth/login').set('Origin', origin)
      .set('X-CSRF-Token', csrfResponse.body.data.csrfToken)
      .send({ email: user.email, password: user.password });
    expect(response.status).toBe(200);
    const rotated = await agent.get('/api/v1/auth/csrf');
    return { agent, csrf: rotated.body.data.csrfToken as string };
  }

  return { app, login, usersService, auditRepository };
}

describe('API de usuarios y auditoría', () => {
  it('niega usuarios y auditoría a viewer; admin consulta ambos', async () => {
    const { app, login, usersService, auditRepository } = setup();
    const viewerSession = await login(viewer);
    expect((await viewerSession.agent.get('/api/v1/users')).status).toBe(403);
    expect((await viewerSession.agent.get('/api/v1/audit-logs')).status).toBe(403);

    const adminSession = await login(admin);
    const users = await adminSession.agent.get('/api/v1/users?limit=10&enabled=true');
    expect(users.status).toBe(200);
    expect(users.body.data).toEqual([userDto(target)]);
    expect(usersService.list).toHaveBeenCalledWith({ limit: 10, enabled: true });
    const audits = await adminSession.agent.get('/api/v1/audit-logs?actorId=admin-users&targetType=user');
    expect(audits.status).toBe(200);
    expect(audits.body.data).toEqual([event]);
    expect(auditRepository.list).toHaveBeenCalledWith({
      actorId: 'admin-users',
      targetType: 'user',
    });
  });

  it('exige CSRF y admin para crear; el cuerpo se valida y no devuelve contraseña', async () => {
    const { login, usersService, app } = setup();
    const { agent, csrf } = await login(admin);
    const body = { email: 'nuevo@test.local', password: 'Password123', displayName: 'Nuevo', role: 'viewer' };

    expect((await agent.post('/api/v1/users').set('Origin', origin).send(body)).status).toBe(403);
    expect(usersService.create).not.toHaveBeenCalled();

    const created = await agent.post('/api/v1/users').set('Origin', origin).set('X-CSRF-Token', csrf).send(body);
    expect(created.status).toBe(201);
    expect(usersService.create).toHaveBeenCalledWith(body, admin.uid);
    expect(created.body.data).not.toHaveProperty('password');

    const invalid = await agent.post('/api/v1/users').set('Origin', origin).set('X-CSRF-Token', csrf)
      .send({ ...body, role: 'operator' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('actualiza con CSRF y pasa los cambios al servicio', async () => {
    const { login, usersService } = setup();
    const { agent, csrf } = await login(admin);
    const response = await agent.patch(`/api/v1/users/${target.uid}`)
      .set('Origin', origin).set('X-CSRF-Token', csrf)
      .send({ displayName: 'Editado', enabled: false });
    expect(response.status).toBe(200);
    expect(usersService.update).toHaveBeenCalledWith(target.uid, { displayName: 'Editado', enabled: false }, admin.uid);
  });
});
