import { describe, expect, it, vi } from 'vitest';
import { FirebaseIdentityProvider } from '../../src/modules/auth/adapters/firebase-identity-provider.js';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildProvider(
  fetchImpl: FetchLike,
  emulatorHost?: string,
): FirebaseIdentityProvider {
  return new FirebaseIdentityProvider({
    apiKey: 'test-api-key',
    ...(emulatorHost ? { emulatorHost } : {}),
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
  });
}

describe('FirebaseIdentityProvider.verifyPassword: mapeo de errores', () => {
  it('INVALID_LOGIN_CREDENTIALS se traduce a 401 INVALID_CREDENTIALS', async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }, 400),
    );
    const provider = buildProvider(fetchMock);

    await expect(provider.verifyPassword('a@b.test', 'x')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('TOO_MANY_ATTEMPTS_TRY_LATER se traduce a 429 TOO_MANY_ATTEMPTS', async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse(
        {
          error: {
            message:
              'TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled.',
          },
        },
        400,
      ),
    );
    const provider = buildProvider(fetchMock);

    await expect(provider.verifyPassword('a@b.test', 'x')).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
    });
  });

  it('una respuesta 5xx se traduce a 503 AUTH_UNAVAILABLE', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({ error: 'boom' }, 500));
    const provider = buildProvider(fetchMock);

    await expect(provider.verifyPassword('a@b.test', 'x')).rejects.toMatchObject({
      status: 503,
      code: 'AUTH_UNAVAILABLE',
    });
  });

  it('un fallo de red se traduce a 503 AUTH_UNAVAILABLE', async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      throw new Error('network down');
    });
    const provider = buildProvider(fetchMock);

    await expect(provider.verifyPassword('a@b.test', 'x')).rejects.toMatchObject({
      status: 503,
      code: 'AUTH_UNAVAILABLE',
    });
  });

  it('sin FIREBASE_WEB_API_KEY responde 503 AUTH_UNAVAILABLE sin llamar a la red', async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ localId: 'uid-1', idToken: 'id-token-1' }),
    );
    const provider = new FirebaseIdentityProvider({
      apiKey: '',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    await expect(provider.verifyPassword('a@b.test', 'x')).rejects.toMatchObject({
      status: 503,
      code: 'AUTH_UNAVAILABLE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usa el emulador cuando se define FIREBASE_AUTH_EMULATOR_HOST', async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse({ localId: 'uid-1', idToken: 'id-token-1' }),
    );
    const provider = buildProvider(fetchMock, '127.0.0.1:9099');

    const result = await provider.verifyPassword('a@b.test', 'x');

    expect(result).toEqual({ uid: 'uid-1', idToken: 'id-token-1' });
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
    );
    expect(calledUrl).toContain('key=test-api-key');
  });
});
