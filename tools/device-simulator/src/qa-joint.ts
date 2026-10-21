import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { makeSample, type Sample } from './simulator.js';

export type Reply = { status: number; body: any };
export type HttpClient = (path: string, method?: string, body?: unknown) => Promise<Reply>;
export type QaResult = { id: string; expected: string; actual: string; state: 'PASS' | 'FAIL' | 'BLOCKED' };
export interface JointDeps {
  admin: HttpClient | null;
  devices: [string, string];
  device: (index: number, path: string, body?: unknown) => Promise<Reply>;
}
class CaseFailure extends Error {}
const need = (condition: unknown, message: string): void => { if (!condition) throw new CaseFailure(message); };
const urlId = (value: string) => encodeURIComponent(value);
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');

/** Real API lifecycle only. Missing prerequisites are not replaced by mocked successes. */
export async function runJointCases(deps: JointDeps): Promise<QaResult[]> {
  const definitions = [
    ['JOINT-CON-17', 'Reasignación por HTTP: historia inmutable de dos placas, aislamiento y duplicado después del cierre'],
    ['JOINT-CONC-08', '3 rondas: finalizar frente a 5 muestras, sin escrituras posteriores ni huérfanas'],
  ];
  const block = (why: string): QaResult[] => definitions.map(([id, expected]) => ({ id, expected, actual: why, state: 'BLOCKED' }));
  if (!deps.admin) return block('Falta login admin del fixture.');
  if (!deps.devices.every(validId) || deps.devices[0] === deps.devices[1]) return block('Se requieren dos placas de QA distintas.');
  const admin = deps.admin;
  try {
    const assignments = await admin('/assignments');
    if (assignments.status !== 200 || !Array.isArray(assignments.body?.data)) return block(`Precondición GET /assignments: HTTP ${assignments.status}; no se iniciaron mutaciones.`);
    for (const [index, deviceId] of deps.devices.entries()) {
      const config = await deps.device(index, 'config');
      const device = await admin(`/devices/${urlId(deviceId)}`);
      const active = await admin(`/assignments?deviceId=${urlId(deviceId)}&status=active`);
      if (config.status !== 200 || config.body?.data?.deviceId !== deviceId || config.body.data.activeSessionId !== null ||
          device.status !== 200 || device.body?.data?.source !== 'simulated' || device.body.data.enabled !== true ||
          active.status !== 200 || !Array.isArray(active.body?.data) || active.body.data.length !== 0 || active.body.pagination?.hasMore !== false) {
        return block(`Placa QA ${index + 1}: falta identidad autenticada, tipo simulated o disponibilidad comprobada; sin mutaciones.`);
      }
    }
  } catch { return block('Precondiciones sin respuesta HTTP; sin mutaciones.'); }

  const results: QaResult[] = [];
  for (const [caseId, expected] of definitions) {
    // Track only resources created by this execution. Never finish a pre-existing session.
    const open = new Map<string, { sessionId?: string; finished: boolean }>();
    let stage = 'preparación';
    let actual = '';
    let state: QaResult['state'] = 'PASS';
    const call = async (path: string, method: string, body: unknown, status: number): Promise<any> => {
      stage = `${method} ${path.split('?')[0]}`;
      const r = await admin(path, method, body);
      need(r.status === status, `${stage}: esperado ${status}, obtenido ${r.status}`);
      return r.body?.data;
    };
    const patient = async () => {
      const data = await call('/patients', 'POST', { code: `QA-${randomUUID().slice(0, 20)}`, displayName: 'Paciente sintético QA Hugo' }, 201);
      need(validId(data?.id), 'Alta paciente sin ID contractual'); return data.id as string;
    };
    const start = async (patientId: string, index: number) => {
      const a = await call('/assignments', 'POST', { patientId, deviceId: deps.devices[index] }, 201);
      need(validId(a?.id), 'Alta asignación sin ID contractual');
      open.set(a.id, { finished: false });
      const s = await call('/sessions', 'POST', { assignmentId: a.id }, 201);
      need(validId(s?.id), 'Alta sesión sin ID contractual');
      open.get(a.id)!.sessionId = s.id;
      const started = await call(`/sessions/${urlId(s.id)}/start`, 'POST', undefined, 200);
      need(started?.status === 'active' && started.patientId === patientId && started.deviceId === deps.devices[index] && started.assignmentId === a.id, 'Inicio: IDs/estado incompatibles');
      return { patientId, assignmentId: a.id as string, sessionId: s.id as string, index };
    };
    const close = async (run: { assignmentId: string; sessionId: string }) => {
      const item = open.get(run.assignmentId)!;
      if (!item.finished) {
        const s = await call(`/sessions/${urlId(run.sessionId)}/finish`, 'POST', undefined, 200);
        need(s?.status === 'finished' && Number.isFinite(Date.parse(s.finishedAt)), 'Finalización sin fecha/estado válido');
        item.finished = true;
      }
      const a = await call(`/assignments/${urlId(run.assignmentId)}/close`, 'POST', undefined, 200);
      need(Number.isFinite(Date.parse(a?.endedAt)), 'Cierre de asignación sin fecha válida');
      open.delete(run.assignmentId);
    };
    const history = async (patientId: string): Promise<any[]> => {
      const rows: any[] = []; const cursors = new Set<string>(); let cursor: string | null = null;
      for (let page = 0; page < 100; page++) {
        stage = 'GET historial paginado';
        const r = await admin(`/patients/${urlId(patientId)}/measurements?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        need(r.status === 200 && Array.isArray(r.body?.data), 'Historial no disponible');
        rows.push(...r.body.data);
        need(r.body.pagination && typeof r.body.pagination.hasMore === 'boolean', 'Historial sin paginación contractual');
        if (!r.body.pagination.hasMore) return rows;
        cursor = r.body.pagination.nextCursor;
        need(typeof cursor === 'string' && cursor.length > 0 && !cursors.has(cursor), 'Cursor ausente o repetido');
        cursors.add(cursor!);
      }
      throw new CaseFailure('Historial excedió 100 páginas; no se afirma cobertura completa');
    };
    const ingest = async (run: { index: number; sessionId: string }, bootId: string, sequence: number) => {
      const sample = makeSample(deps.devices[run.index], run.sessionId, bootId, sequence, 'normal', () => 0.5);
      stage = 'POST medición oficial';
      const r = await deps.device(run.index, 'measurements', sample);
      need(r.status === 201 && r.body?.data?.duplicate === false && validId(r.body.data.measurementId) && Number.isFinite(Date.parse(r.body.data.receivedAt)), `Medición oficial: esperado 201, obtenido ${r.status}`);
      return { sample, ack: r.body.data };
    };
    const matches = (row: any, run: { patientId: string; assignmentId: string; sessionId: string; index: number }, sample: Sample) =>
      row.patientId === run.patientId && row.assignmentId === run.assignmentId && row.sessionId === run.sessionId && row.deviceId === deps.devices[run.index] && row.bootId === sample.bootId && row.sequence === sample.sequence;
    try {
      if (caseId === 'JOINT-CON-17') {
        const a = await patient(); const b = await patient();
        const first = await start(a, 0);
        const firstSample = await ingest(first, randomUUID(), 1);
        const before = await history(a);
        need(before.length === 1 && matches(before[0], first, firstSample.sample), 'Primer tramo sin IDs históricos correctos');
        await close(first);
        const second = await start(a, 1);
        const secondSample = await ingest(second, randomUUID(), 1);
        // Reassign the original board to B as well: its new pointer must not relabel A.
        const other = await start(b, 0);
        const otherSample = await ingest(other, randomUUID(), 1);
        stage = 'Duplicado después de reasignación';
        const duplicate = await deps.device(0, 'measurements', firstSample.sample);
        need(duplicate.status === 200 && duplicate.body?.data?.duplicate === true && duplicate.body.data.measurementId === firstSample.ack.measurementId && duplicate.body.data.receivedAt === firstSample.ack.receivedAt, 'Duplicado posterior no conserva referencia/fecha');
        const conflicting = structuredClone(firstSample.sample); conflicting.measurements.heartRate.value = 99;
        const conflict = await deps.device(0, 'measurements', conflicting);
        need(conflict.status === 409 && conflict.body?.error?.code === 'IDEMPOTENCY_CONFLICT', 'Conflicto posterior no devuelve IDEMPOTENCY_CONFLICT');
        const after = await history(a); const otherRows = await history(b);
        const original = after.find(row => row.id === before[0].id && row.sessionId === first.sessionId);
        need(after.length === 2 && original && isDeepStrictEqual(original, before[0]) && after.some(row => matches(row, second, secondSample.sample)), 'Historia perdió/reasignó/duplicó el primer tramo o el segundo');
        need(otherRows.length === 1 && matches(otherRows[0], other, otherSample.sample), 'Paciente B contiene historia ajena');
        await close(second); await close(other);
        actual = 'Ciclo HTTP completo; A conserva dos placas, B solo su muestra; duplicado/conflicto correctos tras reasignar D1.';
      } else {
        for (let round = 0; round < 3; round++) {
          const run = await start(await patient(), 0); const bootId = randomUUID();
          await ingest(run, bootId, 1); // Baseline must work before testing a race.
          const samples = Array.from({ length: 5 }, (_, i) => makeSample(deps.devices[0], run.sessionId, bootId, i + 2, 'normal'));
          stage = `Carrera ronda ${round + 1}`;
          // allSettled waits for every request before attempting cleanup, even on transport failure.
          const responses = await Promise.allSettled([
            admin(`/sessions/${urlId(run.sessionId)}/finish`, 'POST'),
            ...samples.map(sample => deps.device(0, 'measurements', sample)),
          ]);
          need(responses.every(r => r.status === 'fulfilled'), 'Carrera con respuesta de red perdida; resultado no verificable');
          const replies = responses.map(r => (r as PromiseFulfilledResult<Reply>).value);
          need(replies[0].status === 200 && replies[0].body?.data?.status === 'finished', 'Carrera: fin no confirmado');
          open.get(run.assignmentId)!.finished = true;
          const final = await call(`/sessions/${urlId(run.sessionId)}`, 'GET', undefined, 200);
          need(final?.status === 'finished' && Number.isFinite(Date.parse(final.finishedAt)) && final.finishedAt === replies[0].body.data.finishedAt, 'Carrera: fecha final inestable');
          const rows = await history(run.patientId);
          const accepted = replies.slice(1).filter(r => r.status === 201);
          need(rows.length === accepted.length + 1 && rows.every(row => row.sessionId === run.sessionId && row.assignmentId === run.assignmentId && row.patientId === run.patientId && row.deviceId === deps.devices[0] && Date.parse(row.receivedAt) <= Date.parse(final.finishedAt)), 'Carrera: escrituras huérfanas, perdidas o posteriores al cierre');
          for (let i = 0; i < samples.length; i++) {
            const r = replies[i + 1]; const stored = rows.filter(row => row.bootId === bootId && row.sequence === samples[i].sequence);
            if (r.status === 201) need(r.body?.data?.duplicate === false && stored.length === 1 && stored[0].id === r.body.data.measurementId, 'Carrera: ACK no coincide con persistencia');
            else need(r.status === 409 && r.body?.error?.code === 'SESSION_NOT_ACTIVE' && stored.length === 0, 'Carrera: rechazo inesperado o muestra rechazada persistida');
          }
          await close(run);
        }
        actual = '3 rondas de finish + 5 muestras completadas; ACK/rechazos contrastados con historia y finishedAt.';
      }
    } catch (error) {
      state = 'FAIL'; actual = error instanceof CaseFailure ? error.message : `${stage}: fallo de transporte, no se expone respuesta/credencial`;
    } finally {
      let cleanupFailed = false;
      for (const [assignmentId, item] of open) {
        try {
          if (item.sessionId) await close({ assignmentId, sessionId: item.sessionId });
          else { await call(`/assignments/${urlId(assignmentId)}/close`, 'POST', undefined, 200); open.delete(assignmentId); }
        } catch { cleanupFailed = true; }
      }
      if (cleanupFailed) { state = 'FAIL'; actual += ' Limpieza incompleta: revisar únicamente recursos QA de esta ejecución antes de repetir.'; }
    }
    results.push({ id: caseId, expected, actual, state });
    if (open.size) {
      for (const [id, nextExpected] of definitions.slice(results.length)) results.push({ id, expected: nextExpected, actual: 'Fixture ocupado tras limpieza incompleta del caso anterior.', state: 'BLOCKED' });
      break;
    }
  }
  return results;
}
