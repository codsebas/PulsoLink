import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../../src/modules/auth/auth.types.js';
import { canAccessSession } from '../../src/modules/auth/session-access.js';

const ADMIN: AuthUser = { id: 'uid-admin', displayName: 'Admin', role: 'admin' };
const OPERATOR: AuthUser = { id: 'uid-operador', displayName: 'Operador', role: 'operator' };

describe('canAccessSession', () => {
  it('un admin puede acceder a una sesión ajena', () => {
    expect(canAccessSession(ADMIN, { operatorId: 'uid-otro' })).toBe(true);
  });

  it('un operador puede acceder a su propia sesión', () => {
    expect(canAccessSession(OPERATOR, { operatorId: OPERATOR.id })).toBe(true);
  });

  it('un operador no puede acceder a una sesión ajena', () => {
    expect(canAccessSession(OPERATOR, { operatorId: 'uid-otro' })).toBe(false);
  });
});
