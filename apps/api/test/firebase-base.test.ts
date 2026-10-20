import { describe, expect, it } from 'vitest';
import { assertDisposableEmulators } from '../src/scripts/emulator-fixtures.js';
import { UsersRepositoryAdapter } from '../src/modules/auth/adapters/users-repository-adapter.js';
import { UsersRepository } from '../src/modules/users/users.repository.js';
import { SessionsService } from '../src/modules/sessions/sessions.service.js';

describe('PL2 Firebase base', () => {
  it('rejects live or partially configured environments for local fixtures', () => {
    expect(() => assertDisposableEmulators({ FIREBASE_PROJECT_ID: 'production' })).toThrow();
    expect(() => assertDisposableEmulators({ FIREBASE_PROJECT_ID: 'demo-test', FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080' })).toThrow();
    expect(() => assertDisposableEmulators({ FIREBASE_PROJECT_ID: 'demo-test', FIRESTORE_EMULATOR_HOST: 'remote:18080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099' })).toThrow();
    expect(() => assertDisposableEmulators({ FIREBASE_PROJECT_ID: 'demo-test', FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099' })).not.toThrow();
  });
  it('recognizes viewer and denies writes even through existing session services', async () => {
    const users = { getById: async () => ({ uid: 'viewer', displayName: 'Consulta', role: 'viewer', enabled: true }) } as UsersRepository;
    expect((await new UsersRepositoryAdapter(users).findById('viewer'))?.role).toBe('viewer');
    const service = new SessionsService();
    const viewer = { id: 'viewer', displayName: 'Consulta', role: 'viewer' as const };
    await expect(service.create({ participantCode: 'P-001', deviceId: 'device' }, viewer)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.transition('session', viewer, 'active')).rejects.toMatchObject({ statusCode: 403 });
  });
});
