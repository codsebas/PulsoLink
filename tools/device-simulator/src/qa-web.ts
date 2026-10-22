import type { Reply } from './qa-joint.js';

export const SESSION_COOKIE_NAME = 'pulsolink_session';

// Error codes are fixed API constants, never free text: only these are copied to reports.
const SAFE_ERROR_CODES = new Set(['UNAUTHENTICATED', 'UNAUTHORIZED', 'FORBIDDEN', 'VALIDATION_ERROR', 'DEVICE_ID_MISMATCH', 'SESSION_NOT_ACTIVE',
  'ASSIGNMENT_NOT_ACTIVE', 'IDEMPOTENCY_CONFLICT', 'NOT_FOUND', 'AUTH_UNAVAILABLE', 'INVALID_CREDENTIALS', 'CSRF_INVALID', 'USER_DISABLED',
  'ASSIGNMENT_CONFLICT', 'ASSIGNMENT_IN_USE', 'RESOURCE_DISABLED', 'INVALID_SESSION_STATE', 'INVALID_CURSOR', 'DEVICE_BUSY', 'DEVICE_DISABLED',
  'PATIENT_NOT_FOUND', 'DEVICE_NOT_FOUND', 'ASSIGNMENT_NOT_FOUND', 'SESSION_NOT_FOUND', 'USER_NOT_FOUND', 'AUTH_SYNC_PENDING', 'NO_CHANGES']);

/** HTTP status, known error code and a well-formed requestId; never bodies, messages, cookies or tokens. */
export function summarize(r: Reply): string {
  const requestId = r.body?.error?.requestId;
  const safeId = typeof requestId === 'string' && /^(req-\d{10,16}|[a-f0-9]{8}-[a-f0-9-]{27})$/.test(requestId) ? ` requestId=${requestId}` : '';
  return `HTTP ${r.status}${SAFE_ERROR_CODES.has(r.body?.error?.code) ? ` ${r.body.error.code}` : ''}${safeId}`;
}

export interface RawOptions {
  /** `undefined` sends the current token; `null` omits the header; a string sends that exact token. */
  csrf?: string | null;
  /** `undefined` sends the configured origin; `null` omits the header. */
  origin?: string | null;
  /** Sends an altered copy of the session cookie without changing the stored one. */
  tamperSessionCookie?: boolean;
  timeoutMs?: number;
}

export interface WebSession {
  call: (path: string, method?: string, body?: unknown, timeoutMs?: number) => Promise<Reply>;
  raw: (path: string, method: string, body: unknown, options: RawOptions) => Promise<Reply>;
  csrfToken: () => string;
}

export interface LoginResult { session: WebSession | null; reply: Reply; preLoginCsrf: string }

export interface WebClient {
  /** Session without cookies or CSRF token. */
  bare: () => WebSession;
  /** Session that already holds an anonymous CSRF cookie and token. */
  anonymous: () => Promise<WebSession>;
  login: (email: string, password: string) => Promise<LoginResult>;
}

export interface WebClientOptions { baseUrl: string; origin: string; timeoutMs: number; fetchImpl?: typeof fetch }

const tamper = (value: string) => `${value.slice(0, -1)}${value.endsWith('A') ? 'B' : 'A'}`;

// Real HTTP cookies and CSRF; authentication material stays in memory and is never reported.
export function createWebClient(options: WebClientOptions): WebClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  function bare(): WebSession {
    const cookies = new Map<string, string>();
    let csrf = '';
    const raw = async (path: string, method: string, body: unknown, o: RawOptions = {}): Promise<Reply> => {
      const jar = new Map(cookies);
      const session = jar.get(SESSION_COOKIE_NAME);
      if (o.tamperSessionCookie && session) jar.set(SESSION_COOKIE_NAME, tamper(session));
      const token = o.csrf === undefined ? csrf : o.csrf;
      const origin = o.origin === undefined ? options.origin : o.origin;
      const headers: Record<string, string> = {};
      if (origin) headers.Origin = origin;
      if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (token) headers['X-CSRF-Token'] = token;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetchImpl(`${options.baseUrl}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(o.timeoutMs ?? options.timeoutMs), headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const json = await res.json().catch(() => null) as any;
      if (!o.tamperSessionCookie) {
        for (const header of res.headers.getSetCookie()) { const pair = header.split(';')[0]; const i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
        if (json?.data?.csrfToken) csrf = json.data.csrfToken;
      }
      return { status: res.status, body: json };
    };
    return { raw, call: (path, method = 'GET', body, timeoutMs) => raw(path, method, body, { timeoutMs }), csrfToken: () => csrf };
  }
  return {
    bare,
    anonymous: async () => { const s = bare(); await s.call('/auth/csrf'); return s; },
    login: async (email, password) => {
      const s = bare();
      await s.call('/auth/csrf');
      const preLoginCsrf = s.csrfToken();
      const reply = await s.call('/auth/login', 'POST', { email, password });
      if (reply.status !== 200) return { session: null, reply, preLoginCsrf };
      await s.call('/auth/csrf');
      return { session: s, reply, preLoginCsrf };
    },
  };
}
