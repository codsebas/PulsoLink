import { PersistenceError } from './persistence.js';

interface Turn { tail: Promise<void>; count: number }
const clients = new WeakMap<object, Map<string, Turn>>();
const MAX_SESSION_REQUESTS = 32;

/**
 * Avoid self-contention between live requests to one session. Shared across
 * repository instances, scoped to the Firestore client. Transactions retain
 * correctness across processes; this is not a distributed lock or offline queue.
 */
export async function executeForSession<T>(client: object, sessionId: string, operation: () => Promise<T>): Promise<T> {
  let sessions = clients.get(client);
  if (!sessions) { sessions = new Map(); clients.set(client, sessions); }
  let turn = sessions.get(sessionId);
  if (!turn) { turn = { tail: Promise.resolve(), count: 0 }; sessions.set(sessionId, turn); }
  if (turn.count >= MAX_SESSION_REQUESTS) throw new PersistenceError('RATE_LIMITED', 'Demasiadas operaciones simultáneas para la sesión.');
  const previous = turn.tail;
  let release!: () => void;
  turn.tail = new Promise<void>(resolve => { release = resolve; });
  turn.count++;
  try { await previous; return await operation(); }
  finally {
    turn.count--;
    release();
    if (turn.count === 0) sessions.delete(sessionId);
  }
}
