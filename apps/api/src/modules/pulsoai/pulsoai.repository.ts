import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { getDb } from '../../config/firebase.js';
import { documentId } from '../../shared/persistence.js';
import { AppError } from '../../middleware/error-handler.js';
import type { SummaryStats } from './pulsoai.stats.js';

export type SummaryStatus = 'not_requested' | 'pending' | 'generating' | 'ready' | 'failed' | 'disabled' | 'insufficient_data';
export interface SessionSummary {
  sessionId: string; status: SummaryStatus; stats: SummaryStats | null; text: string | null;
  generatedAt: string | null; errorCode: string | null;
}
export interface SummaryJob extends SessionSummary {
  attempts: number; createdAt: string; updatedAt: string;
  leaseToken: string | null; availableAt: string | null;
  provider: 'groq'; model: string | null; promptVersion: string | null; statsVersion: string; inputHash: string | null;
}
export function pendingSummary(sessionId: string, now: string): SummaryJob {
  return { sessionId, status: 'pending', stats: null, text: null, generatedAt: null, errorCode: null,
    attempts: 0, createdAt: now, updatedAt: now, leaseToken: null, availableAt: now,
    provider: 'groq', model: null, promptVersion: null, statsVersion: 'v1', inputHash: null };
}
export function summaryDto(job: SummaryJob | null, sessionId: string): SessionSummary {
  return { sessionId, status: job?.status ?? 'not_requested', stats: job?.stats ?? null,
    text: job?.text ?? null, generatedAt: job?.generatedAt ?? null, errorCode: job?.errorCode ?? null };
}
export class SummaryRepository {
  constructor(private readonly db: () => Firestore = getDb) {}
  private ref(sessionId: string) { return this.db().collection('sessionSummaries').doc(documentId.parse(sessionId)); }
  async get(sessionId: string): Promise<SummaryJob | null> {
    const doc = await this.ref(sessionId).get();
    return doc.exists ? doc.data() as SummaryJob : null;
  }
  async request(sessionId: string): Promise<SummaryJob> {
    const ref = this.ref(sessionId);
    return this.db().runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const job = snapshot.data() as SummaryJob | undefined;
      if (job && ['pending', 'generating', 'ready'].includes(job.status)) return job;
      const now = new Date().toISOString();
      if (job && Date.parse(now) - Date.parse(job.updatedAt) < 60_000) {
        throw new AppError('SUMMARY_RETRY_TOO_SOON', 'Espere un minuto antes de reintentar PulsoAI.', 409);
      }
      const next = { ...pendingSummary(sessionId, now), stats: job?.stats ?? null };
      tx.set(ref, next);
      return next;
    });
  }
  async claim(now = new Date()): Promise<SummaryJob | null> {
    // One single-field index, no growing collection scan. Terminal jobs have null availableAt.
    const due = await this.db().collection('sessionSummaries')
      .where('availableAt', '<=', now.toISOString()).orderBy('availableAt').limit(1).get();
    if (due.empty) return null;
    const ref = due.docs[0].ref;
    return this.db().runTransaction(async tx => {
      const job = (await tx.get(ref)).data() as SummaryJob | undefined;
      if (!job || !['pending', 'generating'].includes(job.status) || !job.availableAt || job.availableAt > now.toISOString()) return null;
      if (job.attempts >= 3) {
        tx.update(ref, { status: 'failed', availableAt: null, leaseToken: null,
          errorCode: 'ATTEMPTS_EXHAUSTED', updatedAt: now.toISOString() });
        return null;
      }
      const next: SummaryJob = { ...job, status: 'generating', attempts: job.attempts + 1,
        leaseToken: randomUUID(), availableAt: new Date(now.getTime() + 300_000).toISOString(), updatedAt: now.toISOString() };
      tx.update(ref, { status: next.status, attempts: next.attempts, leaseToken: next.leaseToken,
        availableAt: next.availableAt, updatedAt: next.updatedAt });
      return next;
    });
  }
  async publish(job: SummaryJob, changes: Partial<SummaryJob>): Promise<boolean> {
    const ref = this.ref(job.sessionId);
    return this.db().runTransaction(async tx => {
      const current = (await tx.get(ref)).data() as SummaryJob | undefined;
      if (!current || current.status !== 'generating' || current.leaseToken !== job.leaseToken) return false;
      tx.update(ref, { ...changes, updatedAt: new Date().toISOString(), leaseToken: null });
      return true;
    });
  }
}
