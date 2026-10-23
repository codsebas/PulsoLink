import { createHash } from 'node:crypto';
import { AppError } from '../../middleware/error-handler.js';
import { SessionsRepository } from '../sessions/sessions.repository.js';
import { MeasurementsRepository } from '../measurements/measurements.repository.js';
import { canAccessSession } from '../auth/session-access.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SummaryRepository, summaryDto, type SummaryJob } from './pulsoai.repository.js';
import { collectStats, metricKeys, summaryFacts } from './pulsoai.stats.js';
import { generateSummary, GenerationError, PULSOAI_MODEL, PROMPT_VERSION } from './pulsoai.provider.js';

export class SummaryService {
  constructor(private readonly sessions: Pick<SessionsRepository, 'getById'> = new SessionsRepository(),
    private readonly jobs: Pick<SummaryRepository, 'get' | 'request'> = new SummaryRepository()) {}
  private async authorize(id: string, user: AuthUser) {
    const session = await this.sessions.getById(id);
    if (!session || !canAccessSession(user, session)) throw new AppError('SESSION_NOT_FOUND', 'Sesión no encontrada.', 404);
    return session;
  }
  async get(id: string, user: AuthUser) {
    await this.authorize(id, user);
    return summaryDto(await this.jobs.get(id), id);
  }
  async retry(id: string, user: AuthUser) {
    if (user.role !== 'admin') throw new AppError('FORBIDDEN', 'Se requiere rol admin.', 403);
    const session = await this.authorize(id, user);
    if (session.status !== 'finished') throw new AppError('INVALID_SESSION_STATE', 'Finalice la sesión antes de generar el resumen.', 409);
    return summaryDto(await this.jobs.request(id), id);
  }
}

export interface WorkerDependencies {
  jobs: Pick<SummaryRepository, 'claim' | 'publish'>;
  sessions: Pick<SessionsRepository, 'getById'>;
  measurements: Pick<MeasurementsRepository, 'list'>;
  generate: typeof generateSummary;
  config: () => { enabled: boolean; key: string; model: string };
}
export function summaryConfig() {
  return { enabled: process.env.SESSION_SUMMARY_ENABLED === 'true', key: process.env.GROQ_API_KEY ?? '',
    model: process.env.GROQ_MODEL ?? PULSOAI_MODEL };
}
export class SummaryWorker {
  private running = false;
  private nextRunAt = 0;
  constructor(private readonly deps: WorkerDependencies = {
    jobs: new SummaryRepository(), sessions: new SessionsRepository(), measurements: new MeasurementsRepository(),
    generate: generateSummary, config: summaryConfig,
  }) {}
  async tick(): Promise<void> {
    if (this.running || Date.now() < this.nextRunAt) return;
    this.running = true;
    try {
      const job = await this.deps.jobs.claim();
      if (job) await this.process(job);
    } finally { this.running = false; }
  }
  private async process(job: SummaryJob) {
    let stats = job.stats;
    try {
      const session = await this.deps.sessions.getById(job.sessionId);
      if (!session || session.status !== 'finished') throw new GenerationError('INVALID_GENERATION');
      stats = await collectStats(session, options => this.deps.measurements.list(job.sessionId, options));
      const config = this.deps.config();
      const inputHash = createHash('sha256').update(JSON.stringify(stats)).digest('hex');
      const base = { stats, inputHash, promptVersion: PROMPT_VERSION, model: config.model };
      if (!metricKeys.some(key => stats!.metrics[key].validCount > 0)) {
        await this.deps.jobs.publish(job, { ...base, status: 'insufficient_data', availableAt: null,
          text: null, errorCode: null });
        return;
      }
      if (!config.enabled || !config.key) {
        await this.deps.jobs.publish(job, { ...base, status: 'disabled', availableAt: null, text: null, errorCode: null });
        return;
      }
      // Per-process quota guard; external retries remain durable and bounded.
      this.nextRunAt = Date.now() + 30_000;
      const result = await this.deps.generate(summaryFacts(stats), config);
      await this.deps.jobs.publish(job, { ...base, status: 'ready', availableAt: null, text: result.text,
        model: result.model, generatedAt: new Date().toISOString(), errorCode: null });
    } catch (error) {
      const transient = error instanceof GenerationError && error.retryable && job.attempts < 3;
      const code = error instanceof GenerationError ? error.code
        : error instanceof Error && error.message === 'SUMMARY_TOO_LARGE' ? 'SUMMARY_TOO_LARGE' : 'PROVIDER_UNAVAILABLE';
      const delay = error instanceof GenerationError ? error.retryAfterMs : 30_000;
      this.nextRunAt = Math.max(this.nextRunAt, Date.now() + delay);
      await this.deps.jobs.publish(job, { stats, status: transient ? 'pending' : 'failed', text: null,
        errorCode: code, availableAt: transient ? new Date(Date.now() + delay).toISOString() : null });
    }
  }
}

export function startSummaryWorker() {
  const worker = new SummaryWorker();
  const run = () => { void worker.tick().catch(() => console.error('[PulsoAI] No se pudo procesar el trabajo pendiente.')); };
  const timer = setInterval(run, 5000);
  timer.unref();
  run();
  return () => clearInterval(timer);
}
