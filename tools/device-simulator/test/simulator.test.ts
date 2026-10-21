import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readSettings } from '../src/config.js';
import { Simulator, makeSample, seededRandom } from '../src/simulator.js';

const env = { DEVICE_ID: 'test-device', DEVICE_CREDENTIAL_ID: 'test-credential', DEVICE_SECRET: 'ephemeral-test-only' };
const timestamp = '2026-10-20T12:00:00.000Z';
function harness(extra: NodeJS.ProcessEnv = {}) {
  let time = 0;
  let session: string | null = 'session-a';
  const calls: { path: string; body: any; options?: RequestInit }[] = [];
  const logs: string[] = [];
  let intercept: ((path: string, body: any) => Response | undefined) | undefined;
  const fetcher = async (input: any, options?: RequestInit) => {
    const path = String(input).split('/').at(-1)!;
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    calls.push({ path, body, options });
    const overridden = intercept?.(path, body);
    if (overridden) return overridden;
    return Response.json({ data: path === 'config'
      ? { deviceId: env.DEVICE_ID, activeSessionId: session, uploadIntervalMs: 2000, heartbeatIntervalMs: 15000, serverTime: timestamp }
      : path === 'heartbeat' ? { serverTime: timestamp }
      : { measurementId: `m-${body.sequence}`, receivedAt: timestamp, duplicate: false } }, { status: path === 'measurements' ? 201 : 200 });
  };
  const sim = new Simulator(readSettings({ ...env, ...extra }), { fetch: fetcher as typeof fetch, now: () => time, log: m => logs.push(m) });
  return { sim, calls, logs, at: (t: number) => { time = t; }, session: (s: string | null) => { session = s; }, intercept: (f?: typeof intercept) => { intercept = f; } };
}
test('config rejects missing secrets and unsafe URLs without echoing values', () => {
  assert.throws(() => readSettings({}), /DEVICE_SECRET/);
  assert.throws(() => readSettings({ ...env, API_BASE_URL: 'https://user:secret@example.com' }), /sin credenciales/);
  assert.throws(() => readSettings({ ...env, REQUEST_TIMEOUT_MS: '0' }), /REQUEST_TIMEOUT_MS/);
});
test('quality modes and units; seed makes scenarios reproducible', () => {
  const sample = (mode: any) => makeSample('d', 's', 'b', 1, mode, seededRandom(42));
  assert.deepEqual(sample('normal'), sample('normal'));
  const noContact = sample('no_contact');
  assert.equal(noContact.measurements.heartRate.value, null);
  assert.equal(noContact.measurements.spo2.status, 'no_contact');
  assert.equal(noContact.measurements.skinTemperature.status, 'valid');
  for (const mode of ['invalid', 'unavailable']) for (const reading of Object.values(sample(mode).measurements)) {
    assert.equal(reading.status, mode); assert.equal(reading.value, null);
  }
});
test('serialized cadence, boot and sequence; no catch-up burst after a slow iteration', async () => {
  const h = harness(); await h.sim.step();
  assert.deepEqual(h.calls.map(c => c.path), ['config', 'heartbeat', 'measurements']);
  h.at(1999); await h.sim.step(); assert.equal(h.calls.length, 3);
  h.at(2000); await h.sim.step();
  h.at(60000); await h.sim.step(); await h.sim.step();
  const samples = h.calls.filter(c => c.path === 'measurements').map(c => c.body);
  assert.deepEqual(samples.map(s => s.sequence), [1, 2, 3]);
  assert.ok(samples.every(s => s.bootId === h.sim.bootId && s.capturedAt === null && s.deviceId === env.DEVICE_ID));
  assert.ok(h.calls.every(c => c.options?.redirect === 'error'));
});
test('no session keeps heartbeat only; detects start, finish and reassignment', async () => {
  const h = harness(); h.session(null); await h.sim.step();
  assert.equal(h.calls.filter(c => c.path === 'measurements').length, 0);
  h.session('new-session'); h.at(2000); await h.sim.step();
  h.session(null); h.at(4000); await h.sim.step(); h.at(15000); await h.sim.step();
  assert.equal(h.calls.filter(c => c.path === 'measurements').length, 1);
  assert.equal(h.calls.filter(c => c.path === 'heartbeat').length, 2);
});
test('network loss discards the current sample, then sends a new sequence only', async () => {
  const h = harness();
  h.intercept(path => { if (path === 'measurements') throw new Error('sensitive-server-error'); return undefined; });
  await h.sim.step(); h.at(1999); await h.sim.step();
  assert.equal(h.calls.length, 3);
  h.intercept(); h.at(60000); await h.sim.step();
  assert.deepEqual(h.calls.filter(c => c.path === 'measurements').map(c => c.body.sequence), [1, 2]);
  assert.ok(!h.logs.join('').includes('sensitive-server-error'));
});
test('random_disconnect suppresses all traffic for the configured window', async () => {
  const h = harness({ SIMULATOR_MODE: 'random_disconnect', DISCONNECT_EVERY_MS: '2000', DISCONNECT_DURATION_MS: '50000' });
  await h.sim.step(); h.at(2000); await h.sim.step(); h.at(51000); await h.sim.step();
  assert.equal(h.calls.length, 3);
  h.at(52000); await h.sim.step();
  assert.equal(h.calls.filter(c => c.path === 'measurements').length, 2);
});
for (const code of ['SESSION_NOT_ACTIVE', 'ASSIGNMENT_NOT_ACTIVE']) test(`${code} refreshes config and stops measurements`, async () => {
  const h = harness(); h.intercept(path => path === 'measurements' ? Response.json({ error: { code } }, { status: 409 }) : undefined);
  await h.sim.step(); h.session(null); h.intercept(); h.at(2000); await h.sim.step();
  assert.equal(h.calls.filter(c => c.path === 'measurements').length, 1);
  assert.equal(h.calls.filter(c => c.path === 'config').length, 2);
});
test('429 honors Retry-After across every endpoint', async () => {
  const h = harness(); h.intercept(() => Response.json({}, { status: 429, headers: { 'Retry-After': '10' } }));
  await h.sim.step(); h.intercept(); h.at(9999); await h.sim.step(); assert.equal(h.calls.length, 1);
  h.at(10000); await h.sim.step(); assert.equal(h.calls.length, 4);
});
for (const status of [400, 401, 403]) test(`${status} terminates instead of retrying invalid requests`, async () => {
  const h = harness(); h.intercept(() => Response.json({ error: { code: 'DEVICE_ID_MISMATCH', message: env.DEVICE_SECRET } }, { status }));
  await assert.rejects(h.sim.step(), /HTTP/);
  assert.ok(!h.logs.join('').includes(env.DEVICE_SECRET));
});
test('incorrect config identity or malformed success is rejected', async () => {
  const h = harness(); h.intercept(() => Response.json({ data: {} }));
  await assert.rejects(h.sim.step(), /incompatible/);
});
test('200 duplicate acknowledgment is accepted', async () => {
  const h = harness(); h.intercept(path => path === 'measurements' ? Response.json({ data: { measurementId: 'original', receivedAt: timestamp, duplicate: true } }) : undefined);
  await h.sim.step(); assert.match(h.logs.join(''), /duplicate=true/);
});
test('stop prevents further requests', async () => {
  const h = harness(); await h.sim.step(); h.sim.stop(); h.at(20000); await h.sim.step(); assert.equal(h.calls.length, 3);
});
test('real HTTP transport sends contract headers/body and aborts pending work on stop', async () => {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : null });
    if (req.url?.endsWith('config')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: { deviceId: env.DEVICE_ID, activeSessionId: null, uploadIntervalMs: 2000, heartbeatIntervalMs: 15000, serverTime: timestamp } })); }
    // Hold heartbeat open to verify cancellation.
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as any).port;
  const sim = new Simulator(readSettings({ ...env, API_BASE_URL: `http://127.0.0.1:${port}/api/v1` }), { log: () => {} });
  try {
    const pending = sim.step();
    const timeout = Date.now() + 3000;
    while (requests.length < 2 && Date.now() < timeout) await new Promise(r => setTimeout(r, 5));
    assert.equal(requests.length, 2);
    assert.equal(requests[0].authorization, `Bearer ${env.DEVICE_CREDENTIAL_ID}.${env.DEVICE_SECRET}`);
    assert.equal(requests[1].body.deviceId, env.DEVICE_ID);
    sim.stop(); await pending;
  } finally { sim.stop(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});
