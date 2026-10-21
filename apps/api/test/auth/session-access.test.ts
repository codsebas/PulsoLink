import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../../src/modules/auth/auth.types.js';
import { canAccessSession } from '../../src/modules/auth/session-access.js';

const ADMIN: AuthUser = { id: 'uid-admin', displayName: 'Admin', role: 'admin' };
const VIEWER: AuthUser = { id: 'uid-viewer', displayName: 'Viewer', role: 'viewer' };

describe('canAccessSession', () => {
  it('un admin puede acceder a una sesión ajena', () => {
    expect(canAccessSession(ADMIN, { operatorId: 'uid-otro' })).toBe(true);
  });

  it('un viewer puede acceder a su propia sesión', () => {
    expect(canAccessSession(VIEWER, { operatorId: VIEWER.id })).toBe(true);
  });

  it('un viewer puede acceder a una sesión ajena', () => {
    expect(canAccessSession(VIEWER, { operatorId: 'uid-otro' })).toBe(true);
  });
});
