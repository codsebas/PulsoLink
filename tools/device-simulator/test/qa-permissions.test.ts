import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSION_CASE_IDS, exclusiveRound, runPermissionCases } from '../src/qa-permissions.js';
import { SESSION_COOKIE_NAME, createWebClient, summarize } from '../src/qa-web.js';

// These doubles test the QA runner itself, NOT the real backend.
const PASSWORD = 'fixture-password-never-reported';
type Seen = { method: string; path: string; headers: Record<string, string> };

function fakeFetch(options: { loginStatus?: number } = {}) {
  const seen: Seen[] = [];
  const json = (status: number, body: unknown, setCookie?: string) => new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: [['content-type', 'application/json'], ...(setCookie ? [['set-cookie', setCookie] as [string, string]] : [])],
  });
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname.replace('/api/v1', '');
    const method = init?.method ?? 'GET';
    seen.push({ method, path, headers: { ...(init?.headers as Record<string, string>) } });
    if (path === '/auth/csrf') return json(200, { data: { csrfToken: `csrf-${seen.length}` } }, `pulsolink_csrf=c${seen.length}; Path=/`);
    if (path === '/auth/login') {
      const status = options.loginStatus ?? 200;
      return status === 200 ? json(200, { data: { id: 'u1', displayName: 'QA', role: 'admin' } }, `${SESSION_COOKIE_NAME}=session-value; HttpOnly`)
        : json(status, { error: { code: 'INVALID_CREDENTIALS', message: 'texto libre', requestId: 'req-1800000000000' } });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'detalle interno que no debe copiarse', requestId: 'req-1800000000001' } });
  }) as typeof fetch;
  return { impl, seen };
}

const deps = (impl: typeof fetch) => ({
  web: createWebClient({ baseUrl: 'http://qa.local/api/v1', origin: 'http://localhost:5173', timeoutMs: 1000, fetchImpl: impl }),
  adminEmail: 'admin@example.invalid', viewerEmail: 'viewer@example.invalid', password: PASSWORD,
  fixture: { patientA: 'demo-patient-a', patientB: 'demo-patient-b' }, runId: 'test', rounds: 1, concurrency: 3,
});

test('blocks every case without mutations when the fixture login fails', async () => {
  const f = fakeFetch({ loginStatus: 401 });
  const results = await runPermissionCases(deps(f.impl));
  assert.deepEqual(results.map(r => r.id), PERMISSION_CASE_IDS);
  assert.ok(results.every(r => r.state === 'BLOCKED'));
  assert.ok(f.seen.every(s => s.path === '/auth/csrf' || s.path === '/auth/login'));
  assert.ok(!JSON.stringify(results).includes(PASSWORD));
});

test('a missing route is reported as FAIL, never PASS, and dependent rows are blocked', async () => {
  const f = fakeFetch();
  const results = await runPermissionCases(deps(f.impl));
  const byId = new Map(results.map(r => [r.id, r]));
  assert.equal(new Set(results.map(r => r.id)).size, PERMISSION_CASE_IDS.length);
  for (const id of ['AUTH-01', 'ROL-01', 'ROL-02', 'ROL-03']) assert.equal(byId.get(id)?.state, 'FAIL', id);
  assert.equal(byId.get('ROL-04')?.state, 'BLOCKED');
  assert.ok(results.filter(r => r.id.startsWith('ROL-')).every(r => r.state !== 'PASS'));
  const serialized = JSON.stringify(results);
  for (const secret of [PASSWORD, 'session-value', 'detalle interno', 'texto libre']) assert.ok(!serialized.includes(secret), secret);
});

test('exclusive rounds require one creation, matching conflicts and one active record', () => {
  assert.equal(exclusiveRound([201, 409, 409], [undefined, 'ASSIGNMENT_CONFLICT', 'ASSIGNMENT_CONFLICT'], 1, 'ASSIGNMENT_CONFLICT'), true);
  assert.equal(exclusiveRound([201, 201, 409], [undefined, undefined, 'ASSIGNMENT_CONFLICT'], 2, 'ASSIGNMENT_CONFLICT'), false);
  assert.equal(exclusiveRound([201, 409, 500], [undefined, 'ASSIGNMENT_CONFLICT', 'INTERNAL'], 1), false);
  assert.equal(exclusiveRound([201, 409, 409], [undefined, 'ASSIGNMENT_IN_USE', 'ASSIGNMENT_CONFLICT'], 1, 'ASSIGNMENT_CONFLICT'), false);
  assert.equal(exclusiveRound([201, 409, 409], [undefined, 'X', 'Y'], 0), false);
});

test('web client variants omit or alter headers without changing the stored session', async () => {
  const f = fakeFetch();
  const { session } = await createWebClient({ baseUrl: 'http://qa.local/api/v1', origin: 'http://localhost:5173', timeoutMs: 1000, fetchImpl: f.impl })
    .login('admin@example.invalid', PASSWORD);
  assert.ok(session);
  await session.raw('/patients', 'POST', {}, { csrf: null, origin: null });
  const bare = f.seen.at(-1)!.headers;
  assert.equal(bare['X-CSRF-Token'], undefined);
  assert.equal(bare.Origin, undefined);
  await session.raw('/auth/me', 'GET', undefined, { tamperSessionCookie: true });
  assert.match(f.seen.at(-1)!.headers.Cookie, new RegExp(`${SESSION_COOKIE_NAME}=session-valuA`));
  await session.call('/auth/me');
  assert.match(f.seen.at(-1)!.headers.Cookie, new RegExp(`${SESSION_COOKIE_NAME}=session-value(;|$)`));
  assert.ok(f.seen.at(-1)!.headers['X-CSRF-Token']);
});

test('summaries keep only status, known codes and well-formed request ids', () => {
  assert.equal(summarize({ status: 409, body: { error: { code: 'ASSIGNMENT_CONFLICT', message: 'x', requestId: 'req-1800000000000' } } }), 'HTTP 409 ASSIGNMENT_CONFLICT requestId=req-1800000000000');
  assert.equal(summarize({ status: 400, body: { error: { code: 'free text <script>', requestId: 'not-safe value' } } }), 'HTTP 400');
});
