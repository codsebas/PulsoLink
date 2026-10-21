import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { Settings } from './config.js';

const id = z.string().min(1).max(128).regex(/^[^/]+$/);
const utc = z.string().datetime();
const configSchema = z.object({ data: z.object({
  deviceId: id, activeSessionId: id.nullable(),
  uploadIntervalMs: z.number().int().positive().max(2_147_483_647),
  heartbeatIntervalMs: z.number().int().positive().max(2_147_483_647), serverTime: utc,
}).strict() }).strict();
const heartbeatSchema = z.object({ data: z.object({ serverTime: utc }).strict() }).strict();
const ackSchema = z.object({ data: z.object({ measurementId: id, receivedAt: utc, duplicate: z.boolean() }).strict() }).strict();
type DeviceConfig = z.infer<typeof configSchema>['data'];
type Mode = Settings['SIMULATOR_MODE'];
export type Quality = 'valid' | 'no_contact' | 'invalid' | 'unavailable';
export interface Reading { value: number | null; unit: string; status: Quality }
export interface Sample {
  deviceId: string; sessionId: string; bootId: string; sequence: number; capturedAt: null;
  measurements: { heartRate: Reading; spo2: Reading; skinTemperature: Reading };
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function makeSample(deviceId: string, sessionId: string, bootId: string, sequence: number, mode: Mode, random = Math.random): Sample {
  const reading = (unit: string, min: number, max: number): Reading => ({ value: Math.round((min + random() * (max - min)) * 10) / 10, unit, status: 'valid' });
  const measurements = { heartRate: reading('bpm', 60, 100), spo2: reading('%', 95, 100), skinTemperature: reading('C', 25, 35) };
  if (mode === 'no_contact') {
    measurements.heartRate = { value: null, unit: 'bpm', status: mode };
    measurements.spo2 = { value: null, unit: '%', status: mode };
  } else if (mode === 'invalid' || mode === 'unavailable') {
    for (const key of Object.keys(measurements) as (keyof typeof measurements)[]) measurements[key] = { value: null, unit: measurements[key].unit, status: mode };
  }
  return { deviceId, sessionId, bootId, sequence, capturedAt: null, measurements };
}
class ApiFailure extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryMs: number) { super(`HTTP ${status} ${code}`); }
}
export class FatalSimulatorError extends Error {}
interface Dependencies { fetch?: typeof fetch; now?: () => number; random?: () => number; log?: (message: string) => void; bootId?: string }

/** Serialized requests. Only the current sample exists; never a backlog. */
export class Simulator {
  readonly bootId: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly log: (message: string) => void;
  private readonly started: number;
  private config: DeviceConfig | null = null;
  private nextConfig = 0;
  private nextHeartbeat = 0;
  private nextSample = 0;
  private blockedUntil = 0;
  private disconnectAt: number;
  private disconnectedUntil = 0;
  private sequence = 0;
  private stepping = false;
  private stopped = false;
  private readonly controller = new AbortController();
  constructor(readonly settings: Settings, deps: Dependencies = {}) {
    this.fetcher = deps.fetch ?? fetch; this.now = deps.now ?? Date.now;
    this.random = deps.random ?? seededRandom(settings.SIMULATOR_SEED);
    this.log = deps.log ?? console.log; this.bootId = deps.bootId ?? randomUUID();
    this.started = this.now(); this.disconnectAt = this.started + settings.DISCONNECT_EVERY_MS;
  }
  stop(): void { this.stopped = true; this.controller.abort(); }
  private async request(path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const response = await this.fetcher(`${this.settings.API_BASE_URL}/device/${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${this.settings.DEVICE_CREDENTIAL_ID}.${this.settings.DEVICE_SECRET}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(this.settings.REQUEST_TIMEOUT_MS)]),
    });
    // Never log server messages, response bodies, URLs, tokens or arbitrary errors.
    const json = await response.json().catch(() => null) as any;
    if (!response.ok) {
      const known = ['SESSION_NOT_ACTIVE', 'ASSIGNMENT_NOT_ACTIVE', 'DEVICE_ID_MISMATCH', 'IDEMPOTENCY_CONFLICT'];
      const code = known.includes(json?.error?.code) ? json.error.code : 'API_ERROR';
      const header = response.headers.get('retry-after');
      const seconds = header && /^\d+$/.test(header) ? Number(header) : 0;
      throw new ApiFailure(response.status, code, Math.min(seconds * 1000, 2_147_483_647));
    }
    return { status: response.status, json };
  }
  async step(): Promise<void> {
    if (this.stopped) return;
    if (this.stepping) throw new Error('No ejecutar step en paralelo');
    this.stepping = true;
    try {
      let now = this.now();
      if (now < this.blockedUntil) return;
      if (this.settings.SIMULATOR_MODE === 'random_disconnect') {
        if (this.disconnectedUntil) {
          if (now < this.disconnectedUntil) return;
          this.disconnectedUntil = 0;
          this.disconnectAt = now + Math.round(this.settings.DISCONNECT_EVERY_MS * (0.5 + this.random()));
          this.log('Red simulada restablecida; solo muestras nuevas.');
        } else if (now >= this.disconnectAt) {
          this.disconnectedUntil = now + this.settings.DISCONNECT_DURATION_MS;
          this.config = null; this.nextConfig = this.nextHeartbeat = this.nextSample = 0;
          this.log('Corte simulado: heartbeat y mediciones suspendidos, sin cola.'); return;
        }
      }
      if (now >= this.nextConfig || !this.config) {
        const result = await this.request('config');
        const parsed = configSchema.safeParse(result.json);
        if (result.status !== 200 || !parsed.success) throw new FatalSimulatorError('Respuesta config incompatible con Contrato A 2.0.0');
        if (parsed.data.data.deviceId !== this.settings.DEVICE_ID) throw new FatalSimulatorError('DEVICE_ID_MISMATCH en config');
        if (this.config?.activeSessionId !== parsed.data.data.activeSessionId) this.nextSample = 0;
        this.config = parsed.data.data; this.nextConfig = this.now() + this.settings.CONFIG_INTERVAL_MS;
      }
      if (this.stopped) return;
      now = this.now();
      if (now >= this.nextHeartbeat) {
        const result = await this.request('heartbeat', { deviceId: this.settings.DEVICE_ID, bootId: this.bootId, uptimeMs: Math.max(0, Math.floor(now - this.started)), firmwareVersion: 'simulator-2.0.0' });
        if (result.status !== 200 || !heartbeatSchema.safeParse(result.json).success) throw new FatalSimulatorError('Respuesta heartbeat incompatible con Contrato A 2.0.0');
        this.nextHeartbeat = this.now() + this.config.heartbeatIntervalMs;
      }
      if (this.stopped) return;
      if (this.config.activeSessionId && this.now() >= this.nextSample) {
        if (this.sequence >= 4294967295) throw new FatalSimulatorError('Secuencia agotada; reiniciar para generar otro bootId');
        const sample = makeSample(this.settings.DEVICE_ID, this.config.activeSessionId, this.bootId, ++this.sequence, this.settings.SIMULATOR_MODE, this.random);
        const result = await this.request('measurements', sample);
        const ack = ackSchema.safeParse(result.json);
        if (!ack.success || ![200, 201].includes(result.status) || ack.data.data.duplicate !== (result.status === 200)) throw new FatalSimulatorError('Respuesta ingestión incompatible con Contrato A 2.0.0');
        this.log(`Medición ${this.sequence}: HTTP ${result.status}, duplicate=${ack.data.data.duplicate}`);
        this.nextSample = this.now() + this.config.uploadIntervalMs;
      }
    } catch (error) {
      if (this.stopped) return;
      if (error instanceof FatalSimulatorError) throw error;
      if (error instanceof ApiFailure) {
        if ([401, 403].includes(error.status) || (error.status < 500 && ![409, 429].includes(error.status))) throw new FatalSimulatorError(`${error.message}; revisar credenciales/contrato`);
        if (error.status === 409 && !['SESSION_NOT_ACTIVE', 'ASSIGNMENT_NOT_ACTIVE'].includes(error.code)) throw new FatalSimulatorError(error.message);
        this.blockedUntil = this.now() + Math.max(error.retryMs, this.settings.RECONNECT_INTERVAL_MS);
        this.log(`${error.message}; muestra descartada, se consultará config.`);
      } else {
        this.blockedUntil = this.now() + this.settings.RECONNECT_INTERVAL_MS;
        this.log('Red/timeout: muestra descartada, reconexión acotada.');
      }
      this.config = null; this.nextConfig = this.nextHeartbeat = this.nextSample = 0;
    } finally { this.stepping = false; }
  }
  async run(): Promise<void> {
    this.log(`Simulador académico 2.0.0; modo ${this.settings.SIMULATOR_MODE}.`);
    while (!this.stopped) {
      await this.step();
      await delay(25, undefined, { signal: this.controller.signal }).catch(() => {});
    }
  }
}
