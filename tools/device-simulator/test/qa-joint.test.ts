import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOINT_CONCURRENCY_TIMEOUT_MS, runJointCases, type HttpClient, type Reply } from '../src/qa-joint.js';

// This double tests the QA runner's ability to detect defects, NOT the real backend.
function fixture(options: { missing?: boolean; busy?: boolean; corruptHistory?: boolean; acceptedRace?: boolean; lateWrite?: boolean } = {}) {
  let counter = 0; let tick = 0;
  const sessions = new Map<string, any>(); const assignments = new Map<string, any>();
  const rows: any[] = []; const requests: string[] = []; const requestTimeouts: { request: string; timeoutMs?: number }[] = [];
  const time = () => new Date(1800000000000 + ++tick).toISOString();
  const reply = (status: number, data: any): Reply => ({ status, body: { data: structuredClone(data) } });
  const admin: HttpClient = async (path, method = 'GET', body: any, timeoutMs) => {
    requests.push(`${method} ${path}`);
    requestTimeouts.push({ request: `${method} ${path}`, timeoutMs });
    const url = new URL(path, 'http://test'); const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'assignments' && method === 'GET') {
      if (options.missing) return { status: 404, body: {} };
      return { status: 200, body: { data: [], pagination: { hasMore: false, nextCursor: null } } };
    }
    if (parts[0] === 'devices') return reply(200, { source: 'simulated', enabled: true });
    if (path === '/patients' && method === 'POST') return reply(201, { id: `p-${++counter}` });
    if (path === '/assignments' && method === 'POST') {
      const id = `a-${++counter}`; assignments.set(id, { id, ...body, endedAt: null }); return reply(201, assignments.get(id));
    }
    if (parts[0] === 'assignments' && parts[2] === 'close') { const a = assignments.get(parts[1]); a.endedAt ??= time(); return reply(200, a); }
    if (path === '/sessions' && method === 'POST') {
      const a = assignments.get(body.assignmentId); const id = `s-${++counter}`;
      const s = { id, patientId: a.patientId, deviceId: a.deviceId, assignmentId: a.id, status: 'created', finishedAt: null };
      sessions.set(id, s); return reply(201, s);
    }
    if (parts[0] === 'sessions') {
      const s = sessions.get(parts[1]);
      if (parts[2] === 'start') s.status = 'active';
      if (parts[2] === 'finish') {
        if (options.acceptedRace) await new Promise(resolve => setImmediate(resolve));
        s.status = 'finished'; s.finishedAt ??= time();
      }
      return reply(200, s);
    }
    if (parts[0] === 'patients' && parts[2] === 'measurements') {
      const all = rows.filter(row => row.patientId === parts[1]);
      const offset = Number(url.searchParams.get('cursor') || 0);
      const page = structuredClone(all.slice(offset, offset + 1));
      if (options.corruptHistory && all.length > 1 && page[0]) page[0].assignmentId = 'corrupted';
      if (options.lateWrite && page[0]?.sequence > 1) page[0].receivedAt = '2099-01-01T00:00:00.000Z';
      return { status: 200, body: { data: page, pagination: { hasMore: offset + 1 < all.length, nextCursor: offset + 1 < all.length ? String(offset + 1) : null } } };
    }
    throw new Error('Unexpected test request');
  };
  const device = async (index: number, path: string, body?: any, timeoutMs?: number): Promise<Reply> => {
    requests.push(`device${index} ${path}`);
    requestTimeouts.push({ request: `device${index} ${path} sequence=${body?.sequence ?? ''}`, timeoutMs });
    if (path === 'config') return reply(200, { deviceId: `d${index}`, activeSessionId: options.busy ? 'preexisting' : null });
    const existing = rows.find(r => r.deviceId === body.deviceId && r.bootId === body.bootId && r.sequence === body.sequence);
    if (existing) {
      if (JSON.stringify(existing.measurements) !== JSON.stringify(body.measurements)) return { status: 409, body: { error: { code: 'IDEMPOTENCY_CONFLICT' } } };
      return reply(200, { measurementId: existing.id, receivedAt: existing.receivedAt, duplicate: true });
    }
    const s = sessions.get(body.sessionId);
    if (s.status !== 'active') return { status: 409, body: { error: { code: 'SESSION_NOT_ACTIVE' } } };
    const row = { ...body, id: `m-${++counter}`, patientId: s.patientId, assignmentId: s.assignmentId, receivedAt: time() };
    rows.push(row); return reply(201, { measurementId: row.id, receivedAt: row.receivedAt, duplicate: false });
  };
  return { deps: { admin, devices: ['d0', 'd1'] as [string, string], device }, requests, requestTimeouts, sessions, assignments };
}
test('missing CRUD blocks both joint cases without mutations', async () => {
  const f = fixture({ missing: true }); const result = await runJointCases(f.deps);
  assert.deepEqual(result.map(r => r.state), ['BLOCKED', 'BLOCKED']);
  assert.deepEqual(f.requests, ['GET /assignments']);
});
test('busy pre-existing fixture is never finished or reassigned', async () => {
  const f = fixture({ busy: true }); const result = await runJointCases(f.deps);
  assert.ok(result.every(r => r.state === 'BLOCKED'));
  assert.ok(f.requests.every(r => !r.startsWith('POST')));
});
for (const acceptedRace of [false, true]) test(`joint runner verifies history and race (${acceptedRace ? 'accepted before finish' : 'rejected after finish'})`, async () => {
  const f = fixture({ acceptedRace }); const result = await runJointCases(f.deps);
  assert.deepEqual(result.map(r => r.state), ['PASS', 'PASS']);
  assert.equal(f.sessions.size, 6); // three reassignment sessions plus three independent races
  assert.ok([...f.sessions.values()].every(s => s.status === 'finished'));
  assert.ok([...f.assignments.values()].every(a => a.endedAt));
});
test('runner catches historical ID corruption and cleans up its own sessions', async () => {
  const f = fixture({ corruptHistory: true }); const result = await runJointCases(f.deps);
  assert.equal(result[0].state, 'FAIL'); assert.match(result[0].actual, /Historia/);
  assert.ok([...f.sessions.values()].every(s => s.status === 'finished'));
});
test('runner catches a persisted measurement after finishedAt', async () => {
  const f = fixture({ acceptedRace: true, lateWrite: true }); const result = await runJointCases(f.deps);
  assert.equal(result[1].state, 'FAIL'); assert.match(result[1].actual, /posteriores/);
});
test('only JOINT-CONC-08 receives the extended QA timeout', async () => {
  const f = fixture(); const result = await runJointCases(f.deps);
  assert.deepEqual(result.map(r => r.state), ['PASS', 'PASS']);
  assert.equal(JOINT_CONCURRENCY_TIMEOUT_MS, 30_000);
  const finishRequests = f.requestTimeouts.filter(r => r.request.startsWith('POST /sessions/') && r.request.endsWith('/finish'));
  assert.equal(finishRequests.length, 6);
  assert.ok(finishRequests.slice(0, 3).every(r => r.timeoutMs === undefined));
  assert.ok(finishRequests.slice(3).every(r => r.timeoutMs === JOINT_CONCURRENCY_TIMEOUT_MS));
  const concurrentMeasurements = f.requestTimeouts.filter(r => r.request.startsWith('device0 measurements sequence=') && /sequence=[2-6]$/.test(r.request));
  assert.equal(concurrentMeasurements.length, 15);
  assert.ok(concurrentMeasurements.every(r => r.timeoutMs === JOINT_CONCURRENCY_TIMEOUT_MS));
});
