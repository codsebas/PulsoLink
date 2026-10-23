import { describe, expect, it, vi } from 'vitest';
import { collectStats, summaryFacts } from '../src/modules/pulsoai/pulsoai.stats.js';
import { composePlan, generateSummary, GenerationError } from '../src/modules/pulsoai/pulsoai.provider.js';
import { pendingSummary } from '../src/modules/pulsoai/pulsoai.repository.js';
import { SummaryService, SummaryWorker } from '../src/modules/pulsoai/pulsoai.service.js';
import type { SessionDocument } from '../src/modules/sessions/sessions.repository.js';
import type { StoredMeasurement } from '../src/modules/measurements/measurements.repository.js';

const session: SessionDocument = { sessionId: 's', deviceId: 'd', operatorId: 'u', source: 'simulated', status: 'finished',
  startedAt: '2026-10-22T00:00:00.000Z', finishedAt: '2026-10-22T00:10:00.000Z', createdAt: '2026-10-22T00:00:00.000Z', latestMeasurement: null };
const measurement = (optical: boolean, temperature = 31): StoredMeasurement => ({ id: 'm', sessionId: 's', deviceId: 'd',
  source: 'simulated', bootId: 'boot', sequence: 1, capturedAt: null, receivedAt: '2026-10-22T00:01:00.000Z', measurements: {
    heartRate: { value: optical ? 78 : null, status: optical ? 'valid' : 'no_contact', unit: 'bpm' },
    spo2: { value: optical ? 97 : null, status: optical ? 'valid' : 'no_contact', unit: '%' },
    skinTemperature: { value: temperature, status: 'valid', unit: 'C' },
  } });
const page = (data: StoredMeasurement[]) => ({ data, pagination: { hasMore: false, nextCursor: null } });
const options = { key: 'synthetic-secret', model: 'openai/gpt-oss-20b' };

describe('PulsoAI: estadísticas y fidelidad', () => {
  it('recorre todas las páginas, separa calidad óptica y temperatura y no convierte null en cero', async () => {
    const list = vi.fn().mockResolvedValueOnce({ ...page([measurement(true, 30)]), pagination: { hasMore: true, nextCursor: 'next' } })
      .mockResolvedValueOnce(page([measurement(false, 32)]));
    const stats = await collectStats(session, list);
    expect(list.mock.calls[1][0]).toEqual({ limit: 100, cursor: 'next' });
    expect(stats).toMatchObject({ total: 2, durationSeconds: 600, metrics: {
      heartRate: { mean: 78, validCount: 1, quality: { valid: 1, no_contact: 1 } },
      skinTemperature: { mean: 31, min: 30, max: 32, validCount: 2 },
    } });
    const onlyNoContact = await collectStats(session, async () => page([measurement(false)]));
    expect(onlyNoContact.metrics.heartRate).toMatchObject({ mean: null, min: null, max: null });
  });
  it('rechaza paginación incompleta y sesiones ajenas en lugar de truncar estadísticas', async () => {
    await expect(collectStats(session, async () => ({ data: [], pagination: { hasMore: true, nextCursor: null } }))).rejects.toThrow();
    await expect(collectStats(session, async () => page([{ ...measurement(true), sessionId: 'other' }]))).rejects.toThrow();
  });
  it('exige cada hecho exactamente una vez y solo permite variantes aprobadas', async () => {
    const facts = summaryFacts(await collectStats(session, async () => page([measurement(true)])));
    const sentences = facts.map(f => ({ id: f.id, variant: 0 }));
    expect(composePlan(facts, { sentences })).toContain('origen simulado');
    expect(composePlan(facts, { sentences })).toContain('78 bpm');
    expect(() => composePlan(facts, { sentences: sentences.slice(1) })).toThrow();
    expect(() => composePlan(facts, { sentences: sentences.map(() => sentences[0]) })).toThrow();
    expect(() => composePlan(facts, { sentences: sentences.map(s => ({ ...s, variant: 2 })) })).toThrow();
    expect(() => composePlan(facts, { sentences, texto: 'Paciente estable' })).toThrow();
  });
  it('sanea 401/429, respeta Retry-After y rechaza truncamiento y modelos distintos', async () => {
    await expect(generateSummary([], options, vi.fn(async () => new Response('synthetic-secret', { status: 401 })) as typeof fetch))
      .rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: false });
    await expect(generateSummary([], options, vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '120' } })) as typeof fetch))
      .rejects.toMatchObject({ retryable: true, retryAfterMs: 120000 });
    const truncated = vi.fn(async () => Response.json({ model: options.model, choices: [{ finish_reason: 'length', message: { content: '{}' } }] }));
    await expect(generateSummary([], options, truncated as typeof fetch)).rejects.toMatchObject({ code: 'INVALID_GENERATION' });
    await expect(generateSummary([], { ...options, model: 'another-model' }, truncated as typeof fetch)).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });
});

describe('PulsoAI: ciclo de trabajo y permisos', () => {
  function workerSetup(config = { enabled: true, ...options }) {
    const job = { ...pendingSummary('s', new Date().toISOString()), attempts: 1, status: 'generating' as const, leaseToken: 'lease' };
    const jobs = { claim: vi.fn(async () => job), publish: vi.fn(async () => true) };
    const generate = vi.fn(async () => ({ text: 'Texto de prueba', model: options.model }));
    const measurements = { list: vi.fn(async () => page([measurement(true)])) };
    const worker = new SummaryWorker({ jobs, sessions: { getById: vi.fn(async () => session) }, measurements,
      generate, config: () => config });
    return { jobs, generate, measurements, worker };
  }
  it('publica una vez con estadísticas y evita ejecutar ticks superpuestos', async () => {
    const s = workerSetup();
    await Promise.all([s.worker.tick(), s.worker.tick()]);
    expect(s.jobs.claim).toHaveBeenCalledTimes(1);
    expect(s.generate).toHaveBeenCalledTimes(1);
    expect(s.jobs.publish.mock.calls[0][1]).toMatchObject({ status: 'ready', stats: { total: 1 } });
  });
  it('conserva estadísticas sin llamadas cuando está deshabilitado o sin datos válidos', async () => {
    const s = workerSetup({ enabled: false, ...options });
    await s.worker.tick();
    expect(s.generate).not.toHaveBeenCalled();
    expect(s.jobs.publish.mock.calls[0][1]).toMatchObject({ status: 'disabled', stats: { total: 1 } });
    const empty = workerSetup();
    empty.measurements.list.mockResolvedValue(page([]));
    await empty.worker.tick();
    expect(empty.generate).not.toHaveBeenCalled();
    expect(empty.jobs.publish.mock.calls[0][1]).toMatchObject({ status: 'insufficient_data' });
  });
  it('persiste reintento transitorio y no expone el error crudo', async () => {
    const s = workerSetup();
    s.generate.mockRejectedValue(new GenerationError('PROVIDER_UNAVAILABLE', true, 120000));
    await s.worker.tick();
    expect(s.jobs.publish.mock.calls[0][1]).toMatchObject({ status: 'pending', errorCode: 'PROVIDER_UNAVAILABLE', stats: { total: 1 } });
  });
  it('GET no genera trabajo y viewer no puede solicitarlo ni una sesión activa permite generar', async () => {
    const jobs = { get: vi.fn(async () => null), request: vi.fn(async () => pendingSummary('s', new Date().toISOString())) };
    const sessions = { getById: vi.fn(async () => session) };
    const service = new SummaryService(sessions, jobs);
    const viewer = { id: 'v', displayName: 'Viewer', role: 'viewer' as const };
    expect(await service.get('s', viewer)).toMatchObject({ status: 'not_requested' });
    expect(jobs.request).not.toHaveBeenCalled();
    await expect(service.retry('s', viewer)).rejects.toMatchObject({ statusCode: 403 });
    sessions.getById.mockResolvedValue({ ...session, status: 'active' });
    await expect(service.retry('s', { ...viewer, role: 'admin' })).rejects.toMatchObject({ code: 'INVALID_SESSION_STATE' });
    expect(jobs.request).not.toHaveBeenCalled();
  });
});
