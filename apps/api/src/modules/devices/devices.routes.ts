import { Router, Request, Response } from 'express';
import { sendError } from '../../shared/response.js';

export const devicesRouter = Router();

/**
 * GET /api/v1/devices
 * Punto de integración para listar dispositivos habilitados (Issue #5 - Didhyer).
 */
devicesRouter.get('/', (_req: Request, res: Response) => {
  sendError(
    res,
    'NOT_IMPLEMENTED',
    'La consulta de dispositivos habilitados está en desarrollo (Issue #5 - Didhyer).',
    501
  );
});
