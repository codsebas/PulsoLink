import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readSettings } from './config.js';
import { makeSample, seededRandom } from './simulator.js';

type Result = { id: string; expected: string; actual: string; state: 'PASS' | 'FAIL' | 'BLOCKED' };
type Reply = { status: number; body: any };
const results: Result[] = [];
const record = (id: string, expected: string, actual: string, pass: boolean) => results.push({ id, expected, actual, state: pass ? 'PASS' : 'FAIL' });
const blocked = (id: string, why: string) => results.push({ id, expected: 'Ver matriz PL2-08 de Hugo', actual: why, state: 'BLOCKED' });
const codes = new Set(['UNAUTHENTICATED', 'UNAUTHORIZED', 'FORBIDDEN', 'VALIDATION_ERROR', 'DEVICE_ID_MISMATCH', 'SESSION_NOT_ACTIVE', 'ASSIGNMENT_NOT_ACTIVE', 'IDEMPOTENCY_CONFLICT', 'NOT_FOUND', 'AUTH_UNAVAILABLE', 'INVALID_CREDENTIALS', 'CSRF_INVALID', 'USER_DISABLED', 'ASSIGNMENT_CONFLICT', 'ASSIGNMENT_IN_USE']);
const summary = (r: Reply) => {
  const requestId = r.body?.error?.requestId;
  const safeId = typeof requestId === 'string' && /^(req-\d{10,16}|[a-f0-9]{8}-[a-f0-9-]{27})$/.test(requestId) ? ` requestId=${requestId}` : '';
  return `HTTP ${r.status}${codes.has(r.body?.error?.code) ? ` ${r.body.error.code}` : ''}${safeId}`;
};

async function main() {
  if (process.env.QA_ALLOW_WRITES !== 'true') throw new Error('QA_ALLOW_WRITES=true requerido; usar únicamente fixtures desechables.');
  const s = readSettings(process.env);
  const token = `${s.DEVICE_CREDENTIAL_ID}.${s.DEVICE_SECRET}`;
  const origin = process.env.QA_ORIGIN ?? 'http://localhost:5173';
  async function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    const response = await fetch(`${s.API_BASE_URL}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(s.REQUEST_TIMEOUT_MS), redirect: 'error' });
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  const device = (path: string, body?: unknown, credential = token) => request(`/device/${path}`, body === undefined ? 'GET' : 'POST', body, credential ? { Authorization: `Bearer ${credential}` } : {});
  async function check(id: string, expected: string, call: () => Promise<Reply>, predicate: (r: Reply) => boolean) {
    try { const r = await call(); record(id, expected, summary(r), predicate(r)); return r; }
    catch { blocked(id, 'Sin respuesta HTTP (red/timeout); no se registran secretos ni errores internos.'); return null; }
  }
  await check('A-01', '401 UNAUTHENTICATED sin credencial', () => device('config', undefined, ''), r => r.status === 401 && r.body?.error?.code === 'UNAUTHENTICATED');
  await check('A-02', '401 UNAUTHENTICATED con credencial incorrecta', () => device('config', undefined, `invalid.${randomUUID()}`), r => r.status === 401 && r.body?.error?.code === 'UNAUTHENTICATED');
  const config = await check('A-03', '200 config: identidad, sesión e intervalos', () => device('config'), r => r.status === 200 && r.body?.data?.deviceId === s.DEVICE_ID && Number.isInteger(r.body.data.uploadIntervalMs) && r.body.data.uploadIntervalMs > 0 && Number.isInteger(r.body.data.heartbeatIntervalMs) && r.body.data.heartbeatIntervalMs > 0 && (r.body.data.activeSessionId === null || typeof r.body.data.activeSessionId === 'string') && typeof r.body.data.serverTime === 'string');
  const bootId = randomUUID();
  const heartbeat = { deviceId: s.DEVICE_ID, bootId, uptimeMs: 0, firmwareVersion: 'simulator-2.0.0' };
  await check('A-04', '403 DEVICE_ID_MISMATCH heartbeat', () => device('heartbeat', { ...heartbeat, deviceId: 'qa-other-device' }), r => r.status === 403 && r.body?.error?.code === 'DEVICE_ID_MISMATCH');
  await check('A-05', '200 heartbeat, solo data.serverTime', () => device('heartbeat', heartbeat), r => r.status === 200 && typeof r.body?.data?.serverTime === 'string' && Object.keys(r.body.data).length === 1);
  const sessionId = process.env.QA_SESSION_ID ?? config?.body?.data?.activeSessionId;
  const sampleIds = ['A-06', 'A-07', 'A-08', 'A-09', 'A-10', 'A-11', 'A-12', 'A-13', 'A-14', 'A-15', 'A-16', 'A-17'];
  if (!sessionId) sampleIds.forEach(id => blocked(id, 'Falta sesión activa del fixture (config o QA_SESSION_ID).'));
  else {
    const sample = makeSample(s.DEVICE_ID, sessionId, bootId, 1, 'normal', seededRandom(42));
    await check('A-06', '403 DEVICE_ID_MISMATCH medición', () => device('measurements', { ...sample, deviceId: 'qa-other-device' }), r => r.status === 403 && r.body?.error?.code === 'DEVICE_ID_MISMATCH');
    const first = await check('A-07', '201 medición nueva, duplicate=false', () => device('measurements', sample), r => r.status === 201 && r.body?.data?.duplicate === false && typeof r.body.data.measurementId === 'string' && typeof r.body.data.receivedAt === 'string');
    if (first?.status !== 201) sampleIds.slice(2).forEach(id => blocked(id, 'A-07 no acepta el payload oficial; corregir ingestión #27 antes de probar este caso.'));
    else {
      await check('A-08', '200 duplicado, misma referencia/fecha', () => device('measurements', sample), r => r.status === 200 && r.body?.data?.duplicate === true && r.body.data.measurementId === first.body.data.measurementId && r.body.data.receivedAt === first.body.data.receivedAt);
      await check('A-09', '409 IDEMPOTENCY_CONFLICT', () => device('measurements', { ...sample, measurements: { ...sample.measurements, heartRate: { value: 99, unit: 'bpm', status: 'valid' } } }), r => r.status === 409 && r.body?.error?.code === 'IDEMPOTENCY_CONFLICT');
      for (const [index, mode] of (['no_contact', 'unavailable', 'invalid'] as const).entries()) {
        await check(`A-${10 + index}`, `201 calidad ${mode} con valores null`, () => device('measurements', makeSample(s.DEVICE_ID, sessionId, bootId, 2 + index, mode)), r => r.status === 201);
      }
      await check('A-13', '400 VALIDATION_ERROR unidades inválidas', () => device('measurements', { ...sample, sequence: 5, measurements: { ...sample.measurements, heartRate: { value: 75, unit: 'C', status: 'valid' } } }), r => r.status === 400 && r.body?.error?.code === 'VALIDATION_ERROR');
      await check('A-14', '400 VALIDATION_ERROR campos solo del servidor', () => device('measurements', { ...sample, sequence: 6, patientId: 'forged-patient' }), r => r.status === 400 && r.body?.error?.code === 'VALIDATION_ERROR');
      await check('A-15', '400 VALIDATION_ERROR secuencia no entera', () => device('measurements', { ...sample, sequence: 1.5 }), r => r.status === 400 && r.body?.error?.code === 'VALIDATION_ERROR');
      await check('A-16', '400 VALIDATION_ERROR calidad incompatible con valor', () => device('measurements', { ...sample, sequence: 7, measurements: { ...sample.measurements, spo2: { value: 98, unit: '%', status: 'no_contact' } } }), r => r.status === 400 && r.body?.error?.code === 'VALIDATION_ERROR');
      try {
        const batches = [];
        for (let round = 0; round < 3; round++) batches.push(await Promise.all(Array.from({ length: 5 }, () => device('measurements', { ...sample, sequence: 20 + round }))));
        const ok = batches.every(batch => batch.filter(r => r.status === 201 && r.body?.data?.duplicate === false).length === 1 && batch.filter(r => r.status === 200 && r.body?.data?.duplicate === true).length === 4 && new Set(batch.map(r => r.body?.data?.measurementId)).size === 1);
        record('A-17', '3 rondas de 5 solicitudes: 1 creación + 4 duplicados cada una', batches.map(b => b.map(r => r.status).join('/')).join('; '), ok);
      } catch { blocked('A-17', 'Sin respuesta en concurrencia.'); }
    }
  }

  // Real HTTP cookies and CSRF; never store or print authentication material.
  async function login(email: string | undefined, password: string | undefined) {
    if (!email || !password) return null;
    const cookies = new Map<string, string>();
    let csrf = '';
    const call = async (path: string, method = 'GET', body?: unknown): Promise<Reply> => {
      const res = await fetch(`${s.API_BASE_URL}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(s.REQUEST_TIMEOUT_MS), headers: { Origin: origin, Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const header of res.headers.getSetCookie()) { const pair = header.split(';')[0]; const i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
      const json = await res.json().catch(() => null) as any;
      if (json?.data?.csrfToken) csrf = json.data.csrfToken;
      return { status: res.status, body: json };
    };
    await call('/auth/csrf');
    const r = await call('/auth/login', 'POST', { email, password });
    if (r.status !== 200) { record(email === process.env.QA_ADMIN_EMAIL ? 'LOGIN-ADMIN' : 'LOGIN-VIEWER', '200 login fixture', summary(r), false); return null; }
    await call('/auth/csrf');
    return call;
  }
  const admin = await login(process.env.QA_ADMIN_EMAIL, process.env.QA_PASSWORD);
  const viewer = await login(process.env.QA_VIEWER_EMAIL, process.env.QA_PASSWORD);
  const patientA = process.env.QA_PATIENT_A ?? 'demo-patient-a';
  const patientB = process.env.QA_PATIENT_B ?? 'demo-patient-b';
  if (viewer) {
    await check('B-01', '403 viewer no administra pacientes', () => viewer(`/patients/${encodeURIComponent(patientA)}`, 'PATCH', { enabled: false }), r => r.status === 403);
    await check('B-02', '403 viewer no consulta auditoría', () => viewer('/audit-logs'), r => r.status === 403);
    await check('B-03', '200 viewer consulta historial', () => viewer(`/patients/${encodeURIComponent(patientA)}/measurements`), r => r.status === 200 && Array.isArray(r.body?.data));
  } else ['B-01', 'B-02', 'B-03'].forEach(id => blocked(id, 'Faltan credenciales viewer o login no disponible.'));
  if (admin) {
    try {
      const readings: any[] = []; const cursors = new Set<string>(); let cursor: string | null = null; let complete = false;
      for (let page = 0; page < 100; page++) {
        const r: Reply = await admin(`/patients/${encodeURIComponent(patientA)}/measurements?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        if (r.status !== 200 || !Array.isArray(r.body?.data)) break;
        readings.push(...r.body.data);
        cursor = r.body.pagination?.nextCursor;
        if (!r.body.pagination?.hasMore) { complete = true; break; }
        if (!cursor || cursors.has(cursor)) break;
        cursors.add(cursor);
      }
      record('B-04', 'Historial fixture: >=2 placas, IDs inmutables, sin duplicados, paginación completa', `${readings.length} lecturas; ${new Set(readings.map(r => r.deviceId)).size} placas; completo=${complete}`, complete && readings.length > 10 && readings.every(r => r.patientId === patientA && r.assignmentId && r.sessionId && r.deviceId) && new Set(readings.map(r => r.deviceId)).size >= 2 && new Set(readings.map(r => `${r.sessionId}/${r.id}`)).size === readings.length);
      await check('B-05', 'Paciente B no contiene lecturas de A', () => admin(`/patients/${encodeURIComponent(patientB)}/measurements`), r => r.status === 200 && Array.isArray(r.body?.data) && r.body.data.every((x: any) => x.patientId === patientB));
      await check('B-06', 'CRUD asignaciones disponible (precondición recorrido CON-17/CONC-08)', () => admin('/assignments'), r => r.status === 200 && Array.isArray(r.body?.data));
    } catch { blocked('B-04', 'No se pudo completar consulta de historia.'); }
  } else ['B-04', 'B-05', 'B-06'].forEach(id => blocked(id, 'Faltan credenciales admin o login no disponible.'));
  // These require an actual lifecycle, not merely seeded history or an isolated client test.
  blocked('JOINT-CON-17', 'Ejecutar alta/finalización/cierre/reasignación por API cuando #27 implemente CRUD; B-04 solo verifica lectura de historia presembrada.');
  blocked('JOINT-CONC-08', 'Requiere ingestión 2.0.0 y sesión/asignación creadas por API; ver protocolo conjunto en matriz.');
  const report = { contract: '2.0.0', generatedAt: new Date().toISOString(), environment: process.env.QA_ENVIRONMENT ?? 'unspecified', results };
  if (process.env.QA_REPORT) await writeFile(process.env.QA_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = results.some(r => r.state === 'FAIL') ? 1 : results.some(r => r.state === 'BLOCKED') ? 2 : 0;
}
main().catch(() => { console.error('QA no completada: verificar configuración, fixtures y conectividad. No se imprimen secretos.'); process.exitCode = 1; });
