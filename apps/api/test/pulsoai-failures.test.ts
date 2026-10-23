import { afterEach, describe, expect, it, vi } from 'vitest';
import { composePlan, generateSummary, GenerationError, PULSOAI_MODEL } from '../src/modules/pulsoai/pulsoai.provider.js';
import { collectStats, summaryFacts } from '../src/modules/pulsoai/pulsoai.stats.js';
import { pendingSummary, type SummaryJob } from '../src/modules/pulsoai/pulsoai.repository.js';
import { SummaryWorker } from '../src/modules/pulsoai/pulsoai.service.js';
import type { SessionDocument } from '../src/modules/sessions/sessions.repository.js';
import type { StoredMeasurement } from '../src/modules/measurements/measurements.repository.js';

const config = { enabled: true, key: 'synthetic-private-key', model: PULSOAI_MODEL };
const session: SessionDocument = { sessionId: 'synthetic-session', deviceId: 'synthetic-device', operatorId: 'admin',
  source: 'simulated', status: 'finished', createdAt: '2026-10-23T00:00:00.000Z',
  startedAt: '2026-10-23T00:00:00.000Z', finishedAt: '2026-10-23T00:01:00.000Z', latestMeasurement: null };
const reading: StoredMeasurement = { id: 'reading', sessionId: session.sessionId, deviceId: session.deviceId,
  source: 'simulated', bootId: 'boot', sequence: 1, capturedAt: null, receivedAt: session.startedAt!, measurements: {
    heartRate: { value: 78, status: 'valid', unit: 'bpm' }, spo2: { value: 97, status: 'valid', unit: '%' },
    skinTemperature: { value: 31, status: 'valid', unit: 'C' },
  } };
const page = (data: StoredMeasurement[]) => ({ data, pagination: { hasMore: false, nextCursor: null } });
const facts = summaryFacts(await collectStats(session, async () => page([reading])));
const plan = { sentences: facts.map(f => ({ id: f.id, variant: 0 })) };
const envelope = (content: string, model = PULSOAI_MODEL, finish_reason = 'stop') =>
  ({ model, choices: [{ finish_reason, message: { content } }] });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('PulsoAI: matriz de fallos del proveedor #72 (sin llamadas externas)', () => {
  it.each([400, 401, 403, 404])('HTTP %i es permanente y no filtra el cuerpo ni la clave', async status => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('synthetic-private-key model_not_found', { status }));
    const error = await generateSummary(facts, config, request).catch(e => e);
    expect(error).toBeInstanceOf(GenerationError);
    expect(error).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: false });
    expect(error.message).toBe('PROVIDER_UNAVAILABLE');
    expect(request).toHaveBeenCalledOnce();
  });
  it.each([429, 500, 502, 503])('HTTP %i permite reintento acotado', async status => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
    await expect(generateSummary(facts, config, request)).rejects.toMatchObject({ retryable: true, retryAfterMs: 30_000 });
    expect(request).toHaveBeenCalledOnce();
  });
  it.each([['120', 120_000], ['0', 30_000], ['invalid', 30_000], ['999999', 86_400_000]])(
    'Retry-After %s respeta el piso y límite de espera', async (header, expected) => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': header } }));
      await expect(generateSummary(facts, config, request)).rejects.toMatchObject({ retryAfterMs: expected });
    });
  it('acepta Retry-After como fecha HTTP', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-23T00:00:00Z'));
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429,
      headers: { 'retry-after': 'Fri, 23 Oct 2026 00:02:00 GMT' } }));
    await expect(generateSummary(facts, config, request)).rejects.toMatchObject({ retryAfterMs: 120_000 });
  });
  it.each(['before-headers', 'during-body'])('timeout de 30 s %s conserva reintento', async phase => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      setTimeout(() => controller.abort(new DOMException('synthetic secret', 'TimeoutError')), ms);
      return controller.signal;
    });
    const waitForAbort = () => new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
    const request = vi.fn<typeof fetch>(async () => {
      if (phase === 'before-headers') return waitForAbort();
      const response = Response.json({});
      vi.spyOn(response, 'json').mockImplementation(waitForAbort);
      return response;
    });
    const result = generateSummary(facts, config, request).catch(error => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true });
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(request).toHaveBeenCalledOnce();
  });
  it('fallo de red es transitorio y saneado', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('synthetic-private-key'));
    await expect(generateSummary(facts, config, request)).rejects.toMatchObject({ message: 'PROVIDER_UNAVAILABLE', retryable: true });
  });
  it('conexión interrumpida durante el cuerpo permite reintento sin filtrar el error', async () => {
    const response = Response.json({});
    vi.spyOn(response, 'json').mockRejectedValue(new TypeError('synthetic-private-key socket terminated'));
    await expect(generateSummary(facts, config, vi.fn<typeof fetch>().mockResolvedValue(response)))
      .rejects.toMatchObject({ message: 'PROVIDER_UNAVAILABLE', retryable: true });
  });
  it.each([
    ['JSON exterior inválido', 'not-json'],
    ['sobre incompleto', JSON.stringify({ choices: [] })],
    ['JSON interior inválido', JSON.stringify(envelope('{'))],
    ['hechos incompletos', JSON.stringify(envelope(JSON.stringify({ sentences: plan.sentences.slice(1) })))],
    ['hechos duplicados', JSON.stringify(envelope(JSON.stringify({ sentences: plan.sentences.map(() => plan.sentences[0]) })))],
    ['hecho inventado', JSON.stringify(envelope(JSON.stringify({ sentences: plan.sentences.map((s, i) => i ? s : { id: 'invented', variant: 0 }) })))],
    ['cifras y diagnóstico inventados', JSON.stringify(envelope(JSON.stringify({ ...plan, text: 'Pulso 200 bpm. Paciente estable.' })))],
    ['variante no autorizada', JSON.stringify(envelope(JSON.stringify({ sentences: plan.sentences.map(s => ({ ...s, variant: 2 })) })))],
    ['otro modelo', JSON.stringify(envelope(JSON.stringify(plan), 'another-model'))],
    ['salida truncada', JSON.stringify(envelope(JSON.stringify(plan), PULSOAI_MODEL, 'length'))],
  ])('rechaza %s sin publicarlo', async (_, response) => {
    await expect(generateSummary(facts, config, vi.fn<typeof fetch>().mockResolvedValue(new Response(response))))
      .rejects.toMatchObject({ code: 'INVALID_GENERATION', retryable: false });
  });
  it('solo envía hechos agregados; un plan válido reproduce exactamente los hechos del servidor', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope(JSON.stringify(plan))));
    expect(await generateSummary(facts, config, request)).toEqual({ text: composePlan(facts, plan), model: PULSOAI_MODEL });
    const body = JSON.parse(request.mock.calls[0][1]!.body as string);
    expect(JSON.parse(body.messages[1].content)).toEqual({ facts });
    expect(body.messages[1].content).not.toContain(session.sessionId);
    expect(body.messages[1].content).not.toContain(session.deviceId);
  });
  it.each([{ ...config, key: ' ' }, { ...config, model: 'unapproved' }])('configuración inválida no llama al proveedor', async options => {
    const request = vi.fn<typeof fetch>();
    await expect(generateSummary(facts, options, request)).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
    expect(request).not.toHaveBeenCalled();
  });
});

describe('PulsoAI: mensajes, conservación y presupuesto de reintentos #72', () => {
  function setup(rows = [reading], attempts = 1) {
    const job: SummaryJob = { ...pendingSummary(session.sessionId, new Date().toISOString()), status: 'generating', attempts, leaseToken: 'lease' };
    const jobs = { claim: vi.fn(async () => job), publish: vi.fn(async () => true) };
    const generate = vi.fn<typeof generateSummary>(async facts => ({ text: composePlan(facts, { sentences: facts.map(f => ({ id: f.id, variant: 0 })) }), model: PULSOAI_MODEL }));
    const worker = new SummaryWorker({ jobs, generate, config: () => config,
      sessions: { getById: async () => session }, measurements: { list: async () => page(rows) } });
    return { worker, jobs, generate };
  }
  it.each(['empty', 'no_contact', 'invalid', 'unavailable'] as const)('%s termina sin IA y sin ceros ficticios', async status => {
    const rows = status === 'empty' ? [] : [{ ...reading, measurements: {
      heartRate: { ...reading.measurements.heartRate, value: null, status },
      spo2: { ...reading.measurements.spo2, value: null, status },
      skinTemperature: { ...reading.measurements.skinTemperature, value: null, status },
    } }];
    const s = setup(rows);
    await s.worker.tick();
    expect(s.generate).not.toHaveBeenCalled();
    const published = s.jobs.publish.mock.calls[0][1];
    expect(published).toMatchObject({ status: 'insufficient_data', text: null, availableAt: null });
    for (const metric of Object.values(published.stats!.metrics)) expect(metric).toMatchObject({ validCount: 0, mean: null, min: null, max: null });
  });
  it('sin contacto óptico conserva temperatura válida y declara origen simulado', async () => {
    const s = setup([{ ...reading, measurements: { ...reading.measurements,
      heartRate: { value: null, unit: 'bpm', status: 'no_contact' }, spo2: { value: null, unit: '%', status: 'no_contact' } } }]);
    await s.worker.tick();
    const result = s.jobs.publish.mock.calls[0][1];
    expect(result).toMatchObject({ status: 'ready', stats: { source: 'simulated', metrics: {
      heartRate: { mean: null }, spo2: { mean: null }, skinTemperature: { mean: 31 } } } });
    expect(result.text).toContain('origen simulado');
    expect(result.text).toContain('sin valores válidos para calcular promedio o rango');
    expect(result.text).toContain('31 °C');
    expect(result.text).not.toMatch(/promedio 0|Paciente estable|diagnóstico:/i);
  });
  it('429 conserva estadísticas y no reclama otro trabajo durante Retry-After', async () => {
    vi.useFakeTimers();
    const s = setup();
    s.generate.mockRejectedValue(new GenerationError('PROVIDER_UNAVAILABLE', true, 120_000));
    const now = Date.now();
    await s.worker.tick();
    expect(s.jobs.publish.mock.calls[0][1]).toMatchObject({ status: 'pending', text: null, stats: { total: 1 },
      availableAt: new Date(now + 120_000).toISOString() });
    await vi.advanceTimersByTimeAsync(119_999);
    await s.worker.tick();
    expect(s.jobs.claim).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await s.worker.tick();
    expect(s.jobs.claim).toHaveBeenCalledTimes(2);
  });
  it.each([
    [new GenerationError('PROVIDER_UNAVAILABLE', true), 3],
    [new GenerationError('PROVIDER_UNAVAILABLE', false), 1],
    [new GenerationError('INVALID_GENERATION'), 1],
  ])('fallo definitivo conserva estadísticas sin publicar texto ni programar más intentos', async (error, attempts) => {
    const s = setup([reading], attempts);
    s.generate.mockRejectedValue(error);
    await s.worker.tick();
    expect(s.jobs.publish.mock.calls[0][1]).toMatchObject({ status: 'failed', stats: { total: 1 }, text: null, availableAt: null, errorCode: error.code });
    expect(session.status).toBe('finished');
  });
});
