import { describe, expect, it, vi } from 'vitest';
import { UsersRepositoryAdapter } from '../../src/modules/auth/adapters/users-repository-adapter.js';
import type {
  UserDocument,
  UsersRepository,
} from '../../src/modules/users/users.repository.js';

function buildAdapter(document: unknown) {
  const getById = vi.fn(async () => document as UserDocument | null);
  const adapter = new UsersRepositoryAdapter({ getById } as unknown as UsersRepository);
  return { adapter, getById };
}

describe('UsersRepositoryAdapter', () => {
  it('mapea uid → id y traduce el documento a AppUser', async () => {
    const { adapter, getById } = buildAdapter({
      uid: 'uid-1',
      displayName: 'Ana',
      role: 'admin',
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(adapter.findById('uid-1')).resolves.toEqual({
      id: 'uid-1',
      displayName: 'Ana',
      role: 'admin',
      enabled: true,
    });
    expect(getById).toHaveBeenCalledWith('uid-1');
  });

  it('devuelve null cuando el documento no existe', async () => {
    const { adapter } = buildAdapter(null);
    await expect(adapter.findById('uid-ausente')).resolves.toBeNull();
  });

  it('devuelve null y registra solo el uid cuando el rol es inválido', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { adapter } = buildAdapter({
        uid: 'uid-2',
        displayName: 'Beto',
        role: 'superadmin',
        enabled: true,
      });

      await expect(adapter.findById('uid-2')).resolves.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = String(warn.mock.calls[0]?.[0]);
      expect(logged).toContain('uid-2');
      expect(logged).not.toContain('superadmin');
      expect(logged).not.toContain('Beto');
    } finally {
      warn.mockRestore();
    }
  });

  it('devuelve null cuando enabled no es booleano', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { adapter } = buildAdapter({
        uid: 'uid-3',
        displayName: 'Carla',
        role: 'operator',
        enabled: 'true',
      });

      await expect(adapter.findById('uid-3')).resolves.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
