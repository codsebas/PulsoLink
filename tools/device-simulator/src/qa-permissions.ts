import { randomBytes, randomUUID } from 'node:crypto';
import { JOINT_CONCURRENCY_TIMEOUT_MS, type QaResult, type Reply } from './qa-joint.js';
import { summarize, type WebClient, type WebSession } from './qa-web.js';

// Matriz PL2-08 de Axel (docs/qa/pl2-08-matriz-api-permisos.md), secciones A–D.
// ROL-05/28, CON-17 y CONC-08 también los cubre la matriz de Hugo; CON-17 y CONC-08 no se repiten aquí.
export const PERMISSION_CASE_IDS = [
  ...range('AUTH', 1, 10), ...range('ROL', 1, 30),
  ...range('CON', 1, 16), 'CON-18',
  ...range('CONC', 1, 7), 'CONC-09',
];

export interface PermissionDeps {
  web: WebClient;
  adminEmail?: string;
  viewerEmail?: string;
  password?: string;
  /** Fixture del seed de Hugo: historial con varias lecturas y una sesión con calidades no válidas. */
  fixture: { patientA: string; patientB: string; sessionId?: string };
  runId?: string;
  rounds?: number;
  concurrency?: number;
}

type Expect = number | number[];

function range(prefix: string, from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => `${prefix}-${String(from + i).padStart(2, '0')}`);
}
const statusIs = (r: Reply | undefined, expected: Expect) => r !== undefined && (Array.isArray(expected) ? expected.includes(r.status) : r.status === expected);
const codeIs = (r: Reply | undefined, status: number, code: string) => r?.status === status && r.body?.error?.code === code;
const urlId = (id: string) => encodeURIComponent(id);
const SECRET_KEY = /password|secret|hash|token/i;
function secretKeys(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    [...(SECRET_KEY.test(key) ? [`${path}${key}`] : []), ...secretKeys(child, `${path}${key}.`)]);
}

/** Exactly one creation; every other attempt rejected with the expected conflict; final state shows one active record. */
export function exclusiveRound(statuses: number[], codes: (string | undefined)[], activeCount: number, conflictCode?: string) {
  const created = statuses.filter(s => s === 201).length;
  const conflicts = statuses.filter((s, i) => s === 409 && (!conflictCode || codes[i] === conflictCode)).length;
  return created === 1 && conflicts === statuses.length - 1 && activeCount === 1;
}

class SetupError extends Error {}

export async function runPermissionCases(deps: PermissionDeps): Promise<QaResult[]> {
  const results: QaResult[] = [];
  const done = new Set<string>();
  const run = deps.runId ?? randomBytes(4).toString('hex');
  const rounds = deps.rounds ?? 3;
  const n = deps.concurrency ?? 5;
  const slow = JOINT_CONCURRENCY_TIMEOUT_MS;
  let counter = 0;
  const code = (tag: string) => `QA-AX-${run}-${tag}${++counter}`.slice(0, 32);
  const record = (id: string, expected: string, actual: string, pass: boolean) => { done.add(id); results.push({ id, expected, actual, state: pass ? 'PASS' : 'FAIL' }); };
  const blocked = (id: string, why: string) => { done.add(id); results.push({ id, expected: 'Ver matriz PL2-08 de Axel', actual: why, state: 'BLOCKED' }); };
  async function section(ids: string[], body: () => Promise<void>) {
    try { await body(); }
    catch (error) {
      const why = error instanceof SetupError ? error.message : 'Sin respuesta HTTP (red/timeout); no se registran secretos ni errores internos.';
      ids.filter(id => !done.has(id)).forEach(id => blocked(id, why));
    }
  }

  const missing = !deps.adminEmail || !deps.viewerEmail || !deps.password;
  const adminLogin = missing ? null : await deps.web.login(deps.adminEmail!, deps.password!).catch(() => null);
  const viewerLogin = missing ? null : await deps.web.login(deps.viewerEmail!, deps.password!).catch(() => null);
  if (!adminLogin?.session || !viewerLogin?.session) {
    const why = missing ? 'Faltan QA_ADMIN_EMAIL, QA_VIEWER_EMAIL o QA_PASSWORD; sin mutaciones.'
      : `Login del fixture no disponible (admin ${adminLogin ? summarize(adminLogin.reply) : 'sin respuesta'}, viewer ${viewerLogin ? summarize(viewerLogin.reply) : 'sin respuesta'}); sin mutaciones.`;
    PERMISSION_CASE_IDS.forEach(id => blocked(id, why));
    return results;
  }
  const admin = adminLogin.session;
  const viewer = viewerLogin.session;
  const anon = deps.web.bare();
  const me = async (s: WebSession) => { const r = await s.call('/auth/me'); return r.status === 200 ? r.body?.data?.id as string : undefined; };
  const adminId = await me(admin).catch(() => undefined);
  const viewerId = await me(viewer).catch(() => undefined);

  // Recursos propios por ejecución; al final se liberan y deshabilitan (el contrato no permite borrar).
  const created = { patients: [] as string[], devices: [] as string[], users: [] as string[], assignments: [] as string[], sessions: [] as string[] };
  async function must(r: Reply, expected: number, what: string) {
    if (r.status !== expected) throw new SetupError(`Preparación fallida (${what}): ${summarize(r)}.`);
    return r.body?.data;
  }
  const newPatient = async (enabled = true) => {
    const p = await must(await admin.call('/patients', 'POST', { code: code('P'), displayName: 'Paciente QA seudónimo' }), 201, 'crear paciente');
    created.patients.push(p.id);
    if (!enabled) await must(await admin.call(`/patients/${urlId(p.id)}`, 'PATCH', { enabled: false }), 200, 'deshabilitar paciente');
    return p.id as string;
  };
  const newDevice = async () => {
    const d = await must(await admin.call('/devices', 'POST', { code: code('D'), source: 'simulated' }), 201, 'crear placa');
    created.devices.push(d.id); return d.id as string;
  };
  const newAssignment = async (patientId: string, deviceId: string) => {
    const a = await must(await admin.call('/assignments', 'POST', { patientId, deviceId }), 201, 'crear asignación');
    created.assignments.push(a.id); return a;
  };
  const newSession = async (assignmentId: string) => {
    const s = await must(await admin.call('/sessions', 'POST', { assignmentId }), 201, 'crear sesión');
    created.sessions.push(s.id); return s;
  };
  const newUser = async (role: 'admin' | 'viewer') => {
    const email = `qa-ax-${run}-${++counter}@example.invalid`;
    const password = `${randomBytes(18).toString('base64url')}Aa1!`;
    const u = await must(await admin.call('/users', 'POST', { email, password, displayName: 'Usuario QA seudónimo', role }, slow), 201, 'crear usuario');
    created.users.push(u.id);
    return { id: u.id as string, email, password, reply: u };
  };
  const activeAssignments = async (filter: string) => {
    const r = await admin.call(`/assignments?status=active&${filter}`);
    if (r.status !== 200 || !Array.isArray(r.body?.data)) throw new SetupError(`Lectura de asignaciones fallida: ${summarize(r)}.`);
    return r.body.data as any[];
  };
  async function auditEvents(query: string) {
    const events: any[] = []; let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const r: Reply = await admin.call(`/audit-logs?limit=100&${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (r.status !== 200 || !Array.isArray(r.body?.data)) throw new SetupError(`Lectura de auditoría fallida: ${summarize(r)}.`);
      events.push(...r.body.data);
      cursor = r.body.pagination?.nextCursor ?? null;
      if (!r.body.pagination?.hasMore || !cursor) break;
    }
    return events;
  }

  // A. Autenticación y CSRF transversales.
  const authErrors: Reply[] = [];
  const keep = (r: Reply) => { authErrors.push(r); return r; };
  await section(range('AUTH', 1, 10), async () => {
    const r1 = keep(await anon.call('/patients'));
    record('AUTH-01', '401 UNAUTHENTICATED sin cookie', summarize(r1), codeIs(r1, 401, 'UNAUTHENTICATED'));
    const r2 = keep(await admin.raw('/auth/me', 'GET', undefined, { tamperSessionCookie: true }));
    record('AUTH-02', '401 con cookie de sesión alterada', summarize(r2), r2.status === 401);
    const noCsrfCode = code('NC');
    const r3 = keep(await admin.raw('/patients', 'POST', { code: noCsrfCode, displayName: 'No debe existir' }, { csrf: null }));
    const list3 = await admin.call('/patients?limit=20');
    const absent3 = list3.status === 200 && !(list3.body?.data ?? []).some((p: any) => p.code === noCsrfCode);
    record('AUTH-03', '403 sin X-CSRF-Token y sin documento creado', `${summarize(r3)}; creado=${!absent3}`, r3.status === 403 && absent3);
    const fresh = await deps.web.login(deps.adminEmail!, deps.password!);
    if (!fresh.session) blocked('AUTH-04', `Segundo login admin no disponible: ${summarize(fresh.reply)}.`);
    else {
      const r4 = keep(await fresh.session.raw('/patients', 'POST', { code: code('OT'), displayName: 'No debe existir' }, { csrf: fresh.preLoginCsrf }));
      record('AUTH-04', '403 con token CSRF anterior al login', summarize(r4), r4.status === 403);
    }
    const r5 = keep(await admin.raw('/patients', 'POST', { code: code('OR'), displayName: 'No debe existir' }, { origin: 'http://evil.local' }));
    record('AUTH-05', '403 con Origin no permitido', summarize(r5), r5.status === 403);
    const anonCsrf = await deps.web.anonymous();
    const r7 = await anonCsrf.call('/auth/logout', 'POST');
    record('AUTH-07', '204 logout sin sesión (idempotente)', summarize(r7), r7.status === 204);
    const r9 = await (await deps.web.anonymous()).call('/auth/login', 'POST', { email: deps.viewerEmail, password: deps.password, role: 'admin' });
    record('AUTH-09', '400 VALIDATION_ERROR si el login trae un rol', summarize(r9), codeIs(r9, 400, 'VALIDATION_ERROR'));
    await section(['AUTH-06'], async () => {
      const dis = await newUser('viewer');
      const disLogin = await deps.web.login(dis.email, dis.password);
      if (!disLogin.session) return blocked('AUTH-06', `Login del usuario a deshabilitar no disponible: ${summarize(disLogin.reply)}.`);
      await must(await admin.call(`/users/${urlId(dis.id)}`, 'PATCH', { enabled: false }, slow), 200, 'deshabilitar usuario');
      const r6 = keep(await disLogin.session.call('/patients'));
      record('AUTH-06', '401 (sesión revocada) o 403 USER_DISABLED; nunca 2xx', summarize(r6), statusIs(r6, [401, 403]));
    });
    await section(['AUTH-08'], async () => {
      const adm2 = await newUser('admin');
      const adm2Login = await deps.web.login(adm2.email, adm2.password);
      if (!adm2Login.session) return blocked('AUTH-08', `Login del admin a degradar no disponible: ${summarize(adm2Login.reply)}.`);
      await must(await admin.call(`/users/${urlId(adm2.id)}`, 'PATCH', { role: 'viewer' }, slow), 200, 'degradar rol');
      const r8 = await adm2Login.session.call('/patients', 'POST', { code: code('DG'), displayName: 'No debe existir' });
      record('AUTH-08', 'Rol degradado: nunca 201; 401 o 403 (P-06)', summarize(r8), statusIs(r8, [401, 403]));
    });
    const withId = authErrors.filter(r => r.status >= 400 && typeof r.body?.error?.requestId === 'string').length;
    const errors = authErrors.filter(r => r.status >= 400).length;
    record('AUTH-10', 'error.requestId presente en los errores de AUTH-01..06', `${withId}/${errors} con requestId`, errors > 0 && withId === errors);
  });

  // B. Matriz de roles por operación: sin sesión / viewer / admin.
  await section(range('ROL', 1, 30), async () => {
    const st: Record<string, string | undefined> = {};
    const access = () => ({ viewId: randomUUID() });
    type Row = { id: string; op: string; method: string; path: () => string | undefined; body?: () => unknown; expect: [Expect, Expect, Expect];
      after?: (data: any) => void; unchanged?: () => Promise<boolean> };
    const field = async (path: string, key: string, value: unknown) => { const r = await admin.call(path); return r.status === 200 && r.body?.data?.[key] === value; };
    const rows: Row[] = [
      { id: 'ROL-01', op: 'GET /auth/me', method: 'GET', path: () => '/auth/me', expect: [401, 200, 200] },
      { id: 'ROL-02', op: 'GET /patients', method: 'GET', path: () => '/patients', expect: [401, 200, 200] },
      { id: 'ROL-03', op: 'POST /patients', method: 'POST', path: () => '/patients', body: () => ({ code: code('R'), displayName: 'Paciente QA seudónimo' }), expect: [401, 403, 201], after: d => { st.patient = d.id; created.patients.push(d.id); } },
      { id: 'ROL-04', op: 'GET /patients/{id}', method: 'GET', path: () => st.patient && `/patients/${urlId(st.patient)}`, expect: [401, 200, 200] },
      { id: 'ROL-05', op: 'PATCH /patients/{id}', method: 'PATCH', path: () => st.patient && `/patients/${urlId(st.patient)}`, body: () => ({ displayName: 'Paciente QA editado' }), expect: [401, 403, 200], unchanged: () => field(`/patients/${urlId(st.patient!)}`, 'displayName', 'Paciente QA seudónimo') },
      { id: 'ROL-06', op: 'GET /devices', method: 'GET', path: () => '/devices', expect: [401, 200, 200] },
      { id: 'ROL-07', op: 'POST /devices', method: 'POST', path: () => '/devices', body: () => ({ code: code('R'), source: 'simulated' }), expect: [401, 403, 201], after: d => { st.device = d.id; created.devices.push(d.id); } },
      { id: 'ROL-08', op: 'GET /devices/{id}', method: 'GET', path: () => st.device && `/devices/${urlId(st.device)}`, expect: [401, 200, 200] },
      { id: 'ROL-09', op: 'PATCH /devices/{id}', method: 'PATCH', path: () => st.device && `/devices/${urlId(st.device)}`, body: () => ({ hardwareId: `qa-hw-${run}` }), expect: [401, 403, 200], unchanged: async () => { const r = await admin.call(`/devices/${urlId(st.device!)}`); return r.status === 200 && r.body?.data?.hardwareId !== `qa-hw-${run}`; } },
      { id: 'ROL-10', op: 'GET /users', method: 'GET', path: () => '/users', expect: [401, 403, 200] },
      { id: 'ROL-11', op: 'POST /users', method: 'POST', path: () => '/users', body: () => ({ email: `qa-ax-${run}-${++counter}@example.invalid`, password: `${randomBytes(18).toString('base64url')}Aa1!`, displayName: 'Usuario QA seudónimo', role: 'viewer' }), expect: [401, 403, 201], after: d => { st.user = d.id; created.users.push(d.id); } },
      { id: 'ROL-12', op: 'GET /users/{id} (el propio viewer)', method: 'GET', path: () => viewerId && `/users/${urlId(viewerId)}`, expect: [401, 403, 200] },
      { id: 'ROL-13', op: 'PATCH /users/{id}', method: 'PATCH', path: () => st.user && `/users/${urlId(st.user)}`, body: () => ({ displayName: 'Usuario QA editado' }), expect: [401, 403, 200], unchanged: () => field(`/users/${urlId(st.user!)}`, 'displayName', 'Usuario QA seudónimo') },
      { id: 'ROL-14', op: 'GET /assignments', method: 'GET', path: () => '/assignments', expect: [401, 200, 200] },
      { id: 'ROL-15', op: 'POST /assignments', method: 'POST', path: () => st.patient && st.device && '/assignments', body: () => ({ patientId: st.patient, deviceId: st.device }), expect: [401, 403, 201], after: d => { st.assignment = d.id; created.assignments.push(d.id); } },
      { id: 'ROL-16', op: 'GET /assignments/{id}', method: 'GET', path: () => st.assignment && `/assignments/${urlId(st.assignment)}`, expect: [401, 200, 200] },
      { id: 'ROL-18', op: 'GET /sessions', method: 'GET', path: () => '/sessions', expect: [401, 200, 200] },
      { id: 'ROL-19', op: 'POST /sessions', method: 'POST', path: () => st.assignment && '/sessions', body: () => ({ assignmentId: st.assignment }), expect: [401, 403, 201], after: d => { st.session = d.id; created.sessions.push(d.id); } },
      { id: 'ROL-20', op: 'GET /sessions/{id}', method: 'GET', path: () => st.session && `/sessions/${urlId(st.session)}`, expect: [401, 200, 200] },
      { id: 'ROL-21', op: 'POST /sessions/{id}/start', method: 'POST', path: () => st.session && `/sessions/${urlId(st.session)}/start`, expect: [401, 403, 200], unchanged: () => field(`/sessions/${urlId(st.session!)}`, 'status', 'created') },
      { id: 'ROL-23', op: 'GET /sessions/{id}/latest', method: 'GET', path: () => st.session && `/sessions/${urlId(st.session)}/latest`, expect: [401, 200, 200] },
      { id: 'ROL-24', op: 'GET /patients/{id}/latest', method: 'GET', path: () => st.patient && `/patients/${urlId(st.patient)}/latest`, expect: [401, 200, 200] },
      { id: 'ROL-25', op: 'GET /sessions/{id}/measurements', method: 'GET', path: () => st.session && `/sessions/${urlId(st.session)}/measurements`, expect: [401, 200, 200] },
      { id: 'ROL-26', op: 'GET /patients/{id}/measurements', method: 'GET', path: () => st.patient && `/patients/${urlId(st.patient)}/measurements`, expect: [401, 200, 200] },
      { id: 'ROL-22', op: 'POST /sessions/{id}/finish', method: 'POST', path: () => st.session && `/sessions/${urlId(st.session)}/finish`, expect: [401, 403, 200], unchanged: () => field(`/sessions/${urlId(st.session!)}`, 'status', 'active') },
      { id: 'ROL-17', op: 'POST /assignments/{id}/close', method: 'POST', path: () => st.assignment && `/assignments/${urlId(st.assignment)}/close`, expect: [401, 403, 200], unchanged: () => field(`/assignments/${urlId(st.assignment!)}`, 'endedAt', null) },
      { id: 'ROL-27', op: 'POST /patients/{id}/access', method: 'POST', path: () => st.patient && `/patients/${urlId(st.patient)}/access`, body: access, expect: [401, 201, 201] },
      { id: 'ROL-28', op: 'GET /audit-logs', method: 'GET', path: () => '/audit-logs', expect: [401, 403, 200] },
      { id: 'ROL-29', op: 'GET /patients?enabled=false', method: 'GET', path: () => '/patients?enabled=false', expect: [401, 403, 200] },
      { id: 'ROL-30', op: 'PATCH /patients/{inexistente}', method: 'PATCH', path: () => `/patients/qa-ax-no-existe-${run}`, body: () => ({ displayName: 'No existe' }), expect: [401, 403, 404] },
    ];
    for (const row of rows) {
      const path = row.path();
      if (!path) { blocked(row.id, 'Falta el recurso creado por una fila anterior (ver su resultado).'); continue; }
      const [ea, ev, ed] = row.expect;
      const a = await anon.raw(path, row.method, row.body?.(), { csrf: null });
      const v = await viewer.call(path, row.method, row.body?.());
      const unchanged = row.unchanged ? await row.unchanged() : true;
      const d = await admin.call(path, row.method, row.body?.(), row.id === 'ROL-11' ? slow : undefined);
      if (statusIs(d, ed) && d.status < 300 && row.after) row.after(d.body?.data);
      const pass = statusIs(a, ea) && statusIs(v, ev) && statusIs(d, ed) && unchanged;
      record(row.id, `${row.op}: sin sesión ${ea} / viewer ${ev} / admin ${ed}${row.unchanged ? '; sin cambios tras el rechazo al viewer' : ''}`,
        `sin sesión ${summarize(a)}; viewer ${summarize(v)}; admin ${summarize(d)}${row.unchanged ? `; sinCambios=${unchanged}` : ''}`, pass);
    }
  });

  // C. Consistencia de datos y reglas de servidor.
  await section([...range('CON', 1, 16), 'CON-18'], async () => {
    const pA = await newPatient(); const pB = await newPatient(); const pX = await newPatient(false);
    const d1 = await newDevice(); const d2 = await newDevice();
    const r1 = await admin.call('/patients', 'POST', { code: code('C'), displayName: 'Paciente QA', enabled: false, createdAt: '2020-01-01T00:00:00Z' });
    record('CON-01', '400 VALIDATION_ERROR con enabled/createdAt del cliente', summarize(r1), codeIs(r1, 400, 'VALIDATION_ERROR'));
    const a1 = await newAssignment(pA, d1);
    const forged = await admin.call('/assignments', 'POST', { patientId: pB, deviceId: d2, assignedBy: 'forged-actor' });
    record('CON-04', 'assignedBy = admin autenticado; el cuerpo no lo fija (400)', `assignedBy=${adminId !== undefined && a1.assignedBy === adminId ? 'actor' : 'distinto'}; forjado ${summarize(forged)}`,
      adminId !== undefined && a1.assignedBy === adminId && codeIs(forged, 400, 'VALIDATION_ERROR'));
    const r2 = await admin.call('/sessions', 'POST', { participantCode: 'P-1' });
    record('CON-02', '400 VALIDATION_ERROR con participantCode', summarize(r2), codeIs(r2, 400, 'VALIDATION_ERROR'));
    const s1 = await newSession(a1.id);
    record('CON-03', '201; patientId/deviceId/assignmentId/source resueltos en servidor', `paciente=${s1.patientId === pA} placa=${s1.deviceId === d1} asignación=${s1.assignmentId === a1.id} origen=${s1.source} estado=${s1.status}`,
      s1.patientId === pA && s1.deviceId === d1 && s1.assignmentId === a1.id && s1.source === 'simulated' && s1.status === 'created');
    const r6 = await admin.call(`/assignments/${urlId(a1.id)}/close`, 'POST');
    record('CON-06', '409 ASSIGNMENT_IN_USE al cerrar con sesión abierta', summarize(r6), codeIs(r6, 409, 'ASSIGNMENT_IN_USE'));
    const r7 = await admin.call(`/patients/${urlId(pA)}`, 'PATCH', { enabled: false });
    record('CON-07', '409 ASSIGNMENT_IN_USE al deshabilitar paciente ocupado', summarize(r7), codeIs(r7, 409, 'ASSIGNMENT_IN_USE'));
    const r8 = await admin.call(`/devices/${urlId(d1)}`, 'PATCH', { enabled: false });
    record('CON-08', '409 ASSIGNMENT_IN_USE al deshabilitar placa ocupada', summarize(r8), codeIs(r8, 409, 'ASSIGNMENT_IN_USE'));
    const r10 = await admin.call('/assignments', 'POST', { patientId: pB, deviceId: d1 });
    record('CON-10', '409 ASSIGNMENT_CONFLICT con placa ocupada', summarize(r10), codeIs(r10, 409, 'ASSIGNMENT_CONFLICT'));
    const r9 = await admin.call('/assignments', 'POST', { patientId: pX, deviceId: d2 });
    if (r9.status === 201) created.assignments.push(r9.body?.data?.id);
    const none9 = (await activeAssignments(`patientId=${urlId(pX)}`)).length === 0;
    record('CON-09', 'Rechazo sin asignación creada (P-05: 403 RESOURCE_DISABLED)', `${summarize(r9)}; activas=${none9 ? 0 : '>0'}`, statusIs(r9, [403, 409]) && none9);
    const path = `/sessions/${urlId(s1.id)}`;
    const t1 = await admin.call(`${path}/finish`, 'POST');
    const t2 = await admin.call(`${path}/start`, 'POST'); const t3 = await admin.call(`${path}/start`, 'POST');
    const t4 = await admin.call(`${path}/finish`, 'POST'); const t5 = await admin.call(`${path}/finish`, 'POST');
    const t6 = await admin.call(`${path}/start`, 'POST');
    const startedSame = t2.status === 200 && t3.status === 200 && typeof t2.body?.data?.startedAt === 'string' && t2.body.data.startedAt === t3.body?.data?.startedAt;
    const finishedSame = t4.status === 200 && t5.status === 200 && typeof t4.body?.data?.finishedAt === 'string' && t4.body.data.finishedAt === t5.body?.data?.finishedAt;
    record('CON-11', 'finish sobre created 409; start ×2 mismo startedAt; finish ×2 mismo finishedAt; start sobre finished 409',
      `finish(created) ${summarize(t1)}; start×2 iguales=${startedSame}; finish×2 iguales=${finishedSame}; start(finished) ${summarize(t6)}`,
      t1.status === 409 && startedSame && finishedSame && t6.status === 409);
    const c1 = await admin.call(`/assignments/${urlId(a1.id)}/close`, 'POST'); const c2 = await admin.call(`/assignments/${urlId(a1.id)}/close`, 'POST');
    record('CON-05', 'close ×2: 200 ambas con mismos endedAt/endedBy', `${summarize(c1)}; ${summarize(c2)}; iguales=${c1.body?.data?.endedAt === c2.body?.data?.endedAt && c1.body?.data?.endedBy === c2.body?.data?.endedBy}`,
      c1.status === 200 && c2.status === 200 && typeof c1.body?.data?.endedAt === 'string' && c1.body.data.endedAt === c2.body?.data?.endedAt && c1.body.data.endedBy === c2.body.data.endedBy && c1.body.data.endedBy === adminId);
    const u12 = await newUser('viewer');
    await must(await admin.call(`/users/${urlId(u12.id)}`, 'PATCH', { displayName: 'Usuario QA editado' }, slow), 200, 'editar usuario');
    await must(await admin.call(`/devices/${urlId(d2)}`, 'PATCH', { hardwareId: `qa-hw-con-${run}` }), 200, 'editar placa');
    const dev12 = await admin.call(`/devices/${urlId(d1)}`);
    const leaks = [...secretKeys(u12.reply), ...secretKeys(dev12.body?.data)];
    record('CON-12', 'Sin password, secreto, hash ni tokens en POST /users ni GET /devices/{id}', leaks.length ? `campos sensibles: ${leaks.length}` : 'sin campos sensibles', dev12.status === 200 && leaks.length === 0);
    if (!adminId) blocked('CON-13', 'No se obtuvo el id del admin en /auth/me.');
    else {
      const events = await auditEvents(`actorId=${urlId(adminId)}`);
      const expected: [string, string][] = [['patient.create', pA], ['patient.update', pX], ['device.create', d1], ['device.update', d2], ['assignment.create', a1.id],
        ['session.create', s1.id], ['session.start', s1.id], ['session.finish', s1.id], ['assignment.close', a1.id], ['user.create', u12.id], ['user.update', u12.id]];
      const counts = expected.map(([action, target]) => events.filter(e => e.action === action && e.targetId === target).length);
      const extraContext = events.filter(e => Object.keys(e.context ?? {}).some(k => k !== 'viewId')).length;
      record('CON-13', 'Un evento por mutación administrativa, con actorId; contexto sin lecturas ni secretos',
        expected.map(([action], i) => `${action}=${counts[i]}`).join(' ') + `; contextoExtra=${extraContext}`,
        counts.every(c => c === 1) && extraContext === 0);
    }
    const viewId = randomUUID();
    const v1 = await viewer.call(`/patients/${urlId(pB)}/access`, 'POST', { viewId });
    const v2 = await viewer.call(`/patients/${urlId(pB)}/access`, 'POST', { viewId });
    record('CON-14', '201 y luego 200 duplicate:true con el mismo eventId', `${summarize(v1)}; ${summarize(v2)} duplicate=${v2.body?.data?.duplicate}`,
      v1.status === 201 && v2.status === 200 && v2.body?.data?.duplicate === true && typeof v1.body?.data?.eventId === 'string' && v1.body.data.eventId === v2.body?.data?.eventId);
    const before = (await auditEvents(`action=patient.view&targetId=${urlId(pB)}`)).length;
    const polls = await Promise.all(Array.from({ length: 10 }, () => viewer.call(`/patients/${urlId(pB)}/latest`)));
    const after = (await auditEvents(`action=patient.view&targetId=${urlId(pB)}`)).length;
    record('CON-15', '10 consultas de latest no añaden eventos patient.view', `latest=${polls.filter(p => p.status === 200).length}/10; eventos ${before}→${after}`, polls.every(p => p.status === 200) && before === after);
    const page = await admin.call(`/patients/${urlId(deps.fixture.patientA)}/measurements?limit=1`);
    const cursor = page.body?.pagination?.nextCursor;
    if (page.status !== 200 || !cursor) blocked('CON-16', `El fixture ${deps.fixture.patientA} no ofrece una segunda página (${summarize(page)}).`);
    else {
      const r16 = await admin.call(`/patients/${urlId(deps.fixture.patientB)}/measurements?limit=1&cursor=${encodeURIComponent(cursor)}`);
      record('CON-16', '400 al reutilizar el cursor con otro paciente (código registrado; contrato: VALIDATION_ERROR)', summarize(r16), r16.status === 400);
    }
    if (!deps.fixture.sessionId) blocked('CON-18', 'Falta la sesión activa del fixture (A-03 o QA_SESSION_ID).');
    else {
      const readings: any[] = []; let next: string | null = null;
      for (let i = 0; i < 5; i++) {
        const r: Reply = await admin.call(`/sessions/${urlId(deps.fixture.sessionId)}/measurements?limit=100${next ? `&cursor=${encodeURIComponent(next)}` : ''}`);
        if (r.status !== 200 || !Array.isArray(r.body?.data)) break;
        readings.push(...r.body.data); next = r.body.pagination?.nextCursor ?? null;
        if (!r.body.pagination?.hasMore || !next) break;
      }
      const vitals = readings.flatMap(m => Object.values(m.measurements ?? {})) as any[];
      const notValid = vitals.filter(v => v?.status !== 'valid');
      if (!notValid.length) blocked('CON-18', 'La sesión del fixture no tiene lecturas no válidas; ejecutar antes A-10..A-12.');
      else record('CON-18', 'Calidad no válida se guarda con value null (nunca 0); válidas numéricas',
        `${notValid.length} no válidas, ${notValid.filter(v => v.value === null).length} con null; ${vitals.length - notValid.length} válidas`,
        notValid.every(v => v.value === null) && vitals.filter(v => v?.status === 'valid').every(v => typeof v.value === 'number'));
    }
  });

  // D. Concurrencia: N peticiones simultáneas por ronda y lectura final; se registra cuántas rondas aprueban.
  async function concurrent(id: string, expected: string, round: (index: number) => Promise<{ pass: boolean; detail: string }>) {
    await section([id], async () => {
      const outcomes: { pass: boolean; detail: string }[] = [];
      for (let i = 0; i < rounds; i++) outcomes.push(await round(i));
      const passed = outcomes.filter(o => o.pass).length;
      record(id, `${expected} (${rounds} rondas de ${n})`, `aprobadas ${passed}/${rounds}; ${outcomes.map((o, i) => `r${i + 1}: ${o.detail}`).join('; ')}`, passed === rounds);
    });
  }
  const settle = async (calls: (() => Promise<Reply>)[]) => (await Promise.allSettled(calls.map(c => c()))).map(s => s.status === 'fulfilled' ? s.value : { status: 0, body: null } as Reply);
  const errorCode = (r: Reply) => typeof r.body?.error?.code === 'string' && /^[A-Z_]{3,40}$/.test(r.body.error.code) ? `:${r.body.error.code}` : '';
  const statusList = (replies: Reply[]) => replies.map(r => r.status ? `${r.status}${errorCode(r)}` : 'sin respuesta').join('/');
  const trackCreated = (replies: Reply[], list: string[]) => replies.filter(r => r.status === 201 && r.body?.data?.id).forEach(r => list.push(r.body.data.id));

  await concurrent('CONC-01', 'Misma placa, pacientes distintos: un 201, resto 409 ASSIGNMENT_CONFLICT, 1 activa', async () => {
    const p1 = await newPatient(); const p2 = await newPatient(); const d = await newDevice();
    const replies = await settle(Array.from({ length: n }, (_, i) => () => admin.call('/assignments', 'POST', { patientId: i % 2 ? p2 : p1, deviceId: d }, slow)));
    trackCreated(replies, created.assignments);
    const active = (await activeAssignments(`deviceId=${urlId(d)}`)).length;
    return { pass: exclusiveRound(replies.map(r => r.status), replies.map(r => r.body?.error?.code), active, 'ASSIGNMENT_CONFLICT'), detail: `${statusList(replies)} activas=${active}` };
  });
  await concurrent('CONC-02', 'Mismo paciente, placas distintas: 1 asignación activa del paciente', async () => {
    const p = await newPatient(); const d1 = await newDevice(); const d2 = await newDevice();
    const replies = await settle(Array.from({ length: n }, (_, i) => () => admin.call('/assignments', 'POST', { patientId: p, deviceId: i % 2 ? d2 : d1 }, slow)));
    trackCreated(replies, created.assignments);
    const active = (await activeAssignments(`patientId=${urlId(p)}`)).length;
    return { pass: exclusiveRound(replies.map(r => r.status), replies.map(r => r.body?.error?.code), active, 'ASSIGNMENT_CONFLICT'), detail: `${statusList(replies)} activas=${active}` };
  });
  await concurrent('CONC-03', 'Petición idéntica repetida: un 201, resto 409, una asignación', async () => {
    const p = await newPatient(); const d = await newDevice();
    const replies = await settle(Array.from({ length: n }, () => () => admin.call('/assignments', 'POST', { patientId: p, deviceId: d }, slow)));
    trackCreated(replies, created.assignments);
    const active = (await activeAssignments(`deviceId=${urlId(d)}`)).length;
    return { pass: exclusiveRound(replies.map(r => r.status), replies.map(r => r.body?.error?.code), active), detail: `${statusList(replies)} activas=${active}` };
  });
  await concurrent('CONC-04', 'Dos sesiones abiertas en la misma asignación: como máximo una (P-05: 409 ASSIGNMENT_IN_USE)', async () => {
    const a = await newAssignment(await newPatient(), await newDevice());
    const replies = await settle(Array.from({ length: n }, () => () => admin.call('/sessions', 'POST', { assignmentId: a.id }, slow)));
    trackCreated(replies, created.sessions);
    const list = await admin.call(`/sessions?assignmentId=${urlId(a.id)}`);
    const open = (list.body?.data ?? []).filter((s: any) => s.status !== 'finished').length;
    return { pass: list.status === 200 && exclusiveRound(replies.map(r => r.status), replies.map(r => r.body?.error?.code), open), detail: `${statusList(replies)} abiertas=${open}` };
  });
  await concurrent('CONC-05', 'Inicio repetido: todas 200 con el mismo startedAt; placa reservada por la sesión', async () => {
    const d = await newDevice(); const a = await newAssignment(await newPatient(), d); const s = await newSession(a.id);
    const replies = await settle(Array.from({ length: n }, () => () => admin.call(`/sessions/${urlId(s.id)}/start`, 'POST', undefined, slow)));
    const starts = new Set(replies.map(r => r.body?.data?.startedAt));
    const dev = await admin.call(`/devices/${urlId(d)}`);
    const reserved = dev.body?.data?.activeSessionId === s.id;
    return { pass: replies.every(r => r.status === 200) && starts.size === 1 && !starts.has(undefined) && reserved, detail: `${statusList(replies)} startedAt=${starts.size} reservada=${reserved}` };
  });
  await concurrent('CONC-06', 'Cierre contra nueva sesión: nunca asignación cerrada con sesión abierta', async () => {
    const a = await newAssignment(await newPatient(), await newDevice());
    const [close, session] = await settle([() => admin.call(`/assignments/${urlId(a.id)}/close`, 'POST', undefined, slow), () => admin.call('/sessions', 'POST', { assignmentId: a.id }, slow)]);
    trackCreated([session], created.sessions);
    const final = await admin.call(`/assignments/${urlId(a.id)}`);
    const sessions = await admin.call(`/sessions?assignmentId=${urlId(a.id)}`);
    const open = (sessions.body?.data ?? []).filter((s: any) => s.status !== 'finished').length;
    const closed = typeof final.body?.data?.endedAt === 'string';
    const consistent = final.status === 200 && sessions.status === 200 && !(close.status === 200 && session.status === 201) && !(closed && open > 0);
    return { pass: consistent, detail: `cierre ${summarize(close)}, sesión ${summarize(session)}, cerrada=${closed} abiertas=${open}` };
  });
  await concurrent('CONC-07', 'Deshabilitar contra asignar: nunca placa deshabilitada con asignación activa', async () => {
    const p = await newPatient(); const d = await newDevice();
    const [disable, assign] = await settle([() => admin.call(`/devices/${urlId(d)}`, 'PATCH', { enabled: false }, slow), () => admin.call('/assignments', 'POST', { patientId: p, deviceId: d }, slow)]);
    trackCreated([assign], created.assignments);
    const dev = await admin.call(`/devices/${urlId(d)}`);
    const active = (await activeAssignments(`deviceId=${urlId(d)}`)).length;
    const disabled = dev.body?.data?.enabled === false;
    return { pass: dev.status === 200 && !(disabled && active > 0), detail: `deshabilitar ${summarize(disable)}, asignar ${summarize(assign)}, deshabilitada=${disabled} activas=${active}` };
  });
  await concurrent('CONC-09', 'Apertura simultánea con el mismo viewId: un 201, resto 200 duplicate:true, un evento', async () => {
    const p = await newPatient(); const viewId = randomUUID();
    const replies = await settle(Array.from({ length: n }, () => () => viewer.call(`/patients/${urlId(p)}/access`, 'POST', { viewId }, slow)));
    const ids = new Set(replies.map(r => r.body?.data?.eventId));
    const events = (await auditEvents(`action=patient.view&targetId=${urlId(p)}`)).filter(e => e.context?.viewId === viewId).length;
    const pass = replies.filter(r => r.status === 201).length === 1 && replies.filter(r => r.status === 200 && r.body?.data?.duplicate === true).length === n - 1 && ids.size === 1 && !ids.has(undefined) && events === 1;
    return { pass, detail: `${statusList(replies)} eventId=${ids.size} eventos=${events}` };
  });

  // Limpieza best effort: liberar reservas y deshabilitar lo creado; nunca altera resultados ya registrados.
  const quiet = async (call: () => Promise<unknown>) => { try { await call(); } catch { /* best effort */ } };
  for (const id of created.sessions) {
    await quiet(async () => {
      const s = await admin.call(`/sessions/${urlId(id)}`);
      if (s.body?.data?.status === 'created') await admin.call(`/sessions/${urlId(id)}/start`, 'POST');
      await admin.call(`/sessions/${urlId(id)}/finish`, 'POST');
    });
  }
  for (const id of created.assignments) await quiet(() => admin.call(`/assignments/${urlId(id)}/close`, 'POST'));
  for (const id of created.patients) await quiet(() => admin.call(`/patients/${urlId(id)}`, 'PATCH', { enabled: false }));
  for (const id of created.devices) await quiet(() => admin.call(`/devices/${urlId(id)}`, 'PATCH', { enabled: false }));
  for (const id of created.users) await quiet(() => admin.call(`/users/${urlId(id)}`, 'PATCH', { enabled: false }, slow));

  PERMISSION_CASE_IDS.filter(id => !done.has(id)).forEach(id => blocked(id, 'No se alcanzó el caso.'));
  return results;
}
