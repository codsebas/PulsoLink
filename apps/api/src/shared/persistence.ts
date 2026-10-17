import { createHash } from 'node:crypto';
import { z } from 'zod';

export class PersistenceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export const documentId = z.string().min(1).max(128).refine(
  (value) => !value.includes('/') && value !== '.' && value !== '..', 'ID de documento inválido',
);
export const dateTime = z.string().datetime({ offset: true }).transform((value) => new Date(value).toISOString());
const pageSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50), cursor: z.string().max(4096).optional(),
  from: dateTime.optional(), to: dateTime.optional(),
}).refine((value) => !value.from || !value.to || value.from < value.to, 'Intervalo inválido');
export interface PageOptions { limit?: number; cursor?: string; from?: string; to?: string }
export interface Page<T> { data: T[]; pagination: { nextCursor: string | null; hasMore: boolean } }
const cursorSchema = z.object({ version: z.literal(1), scope: z.string(), date: dateTime, id: documentId }).strict();

export function pagination(options: PageOptions, scope: Record<string, unknown>) {
  const parsed = pageSchema.parse(options);
  const fingerprint = createHash('sha256').update(JSON.stringify({ ...scope, from: parsed.from ?? null, to: parsed.to ?? null })).digest('hex');
  let after: { date: string; id: string } | undefined;
  if (parsed.cursor) {
    try {
      const decoded = cursorSchema.parse(JSON.parse(Buffer.from(parsed.cursor, 'base64url').toString('utf8')));
      if (decoded.scope !== fingerprint) throw new Error();
      after = { date: decoded.date, id: decoded.id };
    } catch {
      throw new PersistenceError('INVALID_CURSOR', 'El cursor no corresponde a esta consulta.');
    }
  }
  return { ...parsed, after,
    page<T>(rows: T[], key: (row: T) => { date: string; id: string }): Page<T> {
      const hasMore = rows.length > parsed.limit;
      const data = rows.slice(0, parsed.limit);
      const nextCursor = hasMore ? Buffer.from(JSON.stringify({ version: 1, scope: fingerprint, ...key(data[data.length - 1]) })).toString('base64url') : null;
      return { data, pagination: { nextCursor, hasMore } };
    },
  };
}
