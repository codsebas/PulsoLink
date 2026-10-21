import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { PersistenceError, dateTime, documentId } from './persistence.js';

const limit = z.string().regex(/^[0-9]+$/).transform(Number).pipe(z.number().int().min(1).max(100));

export const pageQueryFields = {
  limit: limit.optional(),
  cursor: z.string().min(1).max(4096).optional(),
  from: dateTime.optional(),
  to: dateTime.optional(),
};
const validInterval = (query: { from?: string; to?: string }) => !query.from || !query.to || query.from < query.to;
export const pageQuery = z.object(pageQueryFields).strict().refine(validInterval, 'Intervalo inválido');
export const devicePageQuery = z.object({ limit: pageQueryFields.limit, cursor: pageQueryFields.cursor,
  enabled: z.enum(['true', 'false']).transform((value) => value === 'true').optional() }).strict();

export const sessionListQuery = z.object({ ...pageQueryFields,
  status: z.enum(['created', 'active', 'finished']).optional(),
  deviceId: documentId.optional(),
  patientId: documentId.optional(),
  assignmentId: documentId.optional(),
}).strict().refine(validInterval, 'Intervalo inválido');

// La API del dispositivo responde 401 a DEVICE_DISABLED por su credencial;
// en el contrato web, un dispositivo deshabilitado es un recurso prohibido (403).
// Los demás errores de persistencia los traduce el manejador global.
export function webRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof PersistenceError && error.code === 'DEVICE_DISABLED') {
        next(new AppError(error.code, error.message, 403));
      } else {
        next(error);
      }
    }
  };
}
