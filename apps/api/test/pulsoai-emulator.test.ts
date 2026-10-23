import { afterAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { SessionsRepository } from '../src/modules/sessions/sessions.repository.js';
import { MeasurementsRepository } from '../src/modules/measurements/measurements.repository.js';
import { SummaryRepository, pendingSummary } from '../src/modules/pulsoai/pulsoai.repository.js';
import { SummaryWorker } from '../src/modules/pulsoai/pulsoai.service.js';
import { composePlan } from '../src/modules/pulsoai/pulsoai.provider.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
describe.skipIf(!enabled)('PulsoAI: Firestore Standard emulator', () => {
  if (enabled && !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) throw new Error('Solo demo-.');
  // Separate disposable project: other suites also create pending summaries.
  const app = enabled ? initializeApp({ projectId: `demo-pulsoai-${randomUUID().slice(0, 8)}` }, `pulsoai-${randomUUID()}`) : undefined;
  const db = app ? getFirestore(app) : undefined!;
  const sessions = new SessionsRepository(() => db);
  const measurements = new MeasurementsRepository(() => db);
  const jobs = new SummaryRepository(() => db);
  afterAll(async () => { if (app) await deleteApp(app); });

  it('cierra y encola atómicamente, genera con todas las páginas y reutiliza ready', async () => {
    const deviceId = randomUUID();
    await db.collection('devices').doc(deviceId).set({ deviceId, enabled: true, source: 'simulated', activeSessionId: null });
    const created = await sessions.create({ participantCode: 'DEMO', operatorId: 'admin', deviceId });
    await sessions.start(created.sessionId);
    // Bulk seed synthetic history; separate API suite covers ingestion validation.
    const batch = db.batch();
    for (let i = 0; i < 105; i++) batch.set(db.collection('sessions').doc(created.sessionId).collection('measurements').doc(`m${i}`), {
      id: `m${i}`, sessionId: created.sessionId, deviceId, receivedAt: new Date(1_790_000_000_000 + i).toISOString(),
      measurements: { heartRate: { value: i < 5 ? null : 78, unit: 'bpm', status: i < 5 ? 'no_contact' : 'valid' },
        spo2: { value: i < 5 ? null : 97, unit: '%', status: i < 5 ? 'no_contact' : 'valid' },
        skinTemperature: { value: 31, unit: 'C', status: 'valid' } },
    });
    await batch.commit();
    await sessions.finish(created.sessionId);
    expect((await jobs.get(created.sessionId))?.status).toBe('pending');
    await sessions.finish(created.sessionId); // no duplicate create or timestamp reset
    const worker = new SummaryWorker({ jobs, sessions, measurements, config: () => ({ enabled: true, key: 'synthetic', model: 'openai/gpt-oss-20b' }),
      generate: async facts => ({ model: 'openai/gpt-oss-20b', text: composePlan(facts, {
        sentences: facts.map(f => ({ id: f.id, variant: 0 })),
      }) }) });
    await worker.tick();
    const result = await jobs.get(created.sessionId);
    expect(result).toMatchObject({ status: 'ready', attempts: 1, stats: { total: 105,
      metrics: { heartRate: { validCount: 100, mean: 78 }, skinTemperature: { validCount: 105 } } } });
    expect(result?.text).toContain('origen simulado');
    expect((await jobs.request(created.sessionId))?.generatedAt).toBe(result?.generatedAt);
    expect(await jobs.claim()).toBeNull();
  }, 30000);

  it('exclusión concurrente, recuperación tras reinicio y rechazo de publicador antiguo', async () => {
    const id = randomUUID();
    await db.collection('sessionSummaries').doc(id).set(pendingSummary(id, new Date().toISOString()));
    const claims = await Promise.all([jobs.claim(), jobs.claim()]);
    const first = claims.find(Boolean)!;
    expect(claims.filter(Boolean)).toHaveLength(1);
    await db.collection('sessionSummaries').doc(id).update({ availableAt: '2000-01-01T00:00:00.000Z' });
    const second = await new SummaryRepository(() => db).claim();
    expect(second?.leaseToken).not.toBe(first.leaseToken);
    expect(await jobs.publish(first, { status: 'ready', text: 'obsolete' })).toBe(false);
    expect(await jobs.publish(second!, { status: 'failed', availableAt: null, errorCode: 'INVALID_GENERATION' })).toBe(true);
    await expect(jobs.request(id)).rejects.toMatchObject({ code: 'SUMMARY_RETRY_TOO_SOON' });
    await db.collection('sessionSummaries').doc(id).update({ updatedAt: '2000-01-01T00:00:00.000Z' });
    expect((await jobs.request(id)).status).toBe('pending');
    const third = await jobs.claim();
    await jobs.publish(third!, { status: 'disabled', availableAt: null });
  }, 30000);

  it('resuelve seis carreras en ambos órdenes bajo 5 s conservando historia, idempotencia y un trabajo', async () => {
    const times: number[] = [];
    for (const finishFirst of [true, false]) for (let round = 0; round < 3; round++) {
      const deviceId = randomUUID();
      await db.collection('devices').doc(deviceId).set({ deviceId, enabled: true, source: 'simulated', activeSessionId: null });
      const created = await sessions.create({ participantCode: 'RACE', operatorId: 'admin', deviceId });
      await sessions.start(created.sessionId);
      const bootId = randomUUID();
      const inputs = Array.from({ length: 5 }, (_, sequence) => ({ sessionId: created.sessionId, bootId, sequence, capturedAt: null,
        measurements: { heartRate: { value: 78, status: 'valid' as const, unit: 'bpm' as const },
          spo2: { value: 97, status: 'valid' as const, unit: '%' as const },
          skinTemperature: { value: 31, status: 'valid' as const, unit: 'C' as const } } }));
      const start = performance.now();
      const finished = finishFirst ? sessions.finish(created.sessionId) : undefined;
      const ingestions = inputs.map(input => measurements.ingest(deviceId, input));
      const result = await Promise.allSettled([finished ?? sessions.finish(created.sessionId), ...ingestions]);
      const elapsed = performance.now() - start;
      times.push(Math.round(elapsed));
      expect(elapsed).toBeLessThan(5000);
      expect(result[0].status).toBe('fulfilled');
      const accepted = result.slice(1).filter(x => x.status === 'fulfilled').length;
      expect(accepted).toBe(finishFirst ? 0 : 5);
      const rows = (await measurements.list(created.sessionId)).data;
      expect(rows).toHaveLength(accepted);
      const end = (await sessions.getById(created.sessionId))!;
      for (const row of rows) expect(row.receivedAt <= end.finishedAt!).toBe(true);
      if (!finishFirst) expect((await measurements.ingest(deviceId, inputs[0])).duplicate).toBe(true);
      else for (const failed of result.slice(1)) expect((failed as PromiseRejectedResult).reason.code).toBe('SESSION_NOT_ACTIVE');
      expect((await jobs.get(created.sessionId))?.status).toBe('pending');
      await db.collection('sessionSummaries').doc(created.sessionId).update({ status: 'disabled', availableAt: null });
    }
    console.log('PulsoAI six race rounds (ms):', JSON.stringify(times));
  }, 30000);
});
