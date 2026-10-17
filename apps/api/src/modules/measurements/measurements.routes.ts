import { Router, Request, Response } from 'express';
import { sendError } from '../../shared/response.js';

export const deviceMeasurementsRouter = Router();

/**
 * Endpoints del Contrato A asignados a @codsebas (Issue #4).
 */
deviceMeasurementsRouter.get('/config', (_req: Request, res: Response) => {
  sendError(
    res,
    'NOT_IMPLEMENTED',
    'Configuración del dispositivo está en desarrollo (Issue #4 - @codsebas).',
    501
  );
});

deviceMeasurementsRouter.post('/heartbeat', (_req: Request, res: Response) => {
  sendError(
    res,
    'NOT_IMPLEMENTED',
    'Heartbeat del dispositivo está en desarrollo (Issue #4 - @codsebas).',
    501
  );
});

deviceMeasurementsRouter.post('/measurements', (_req: Request, res: Response) => {
  sendError(
    res,
    'NOT_IMPLEMENTED',
    'Recepción autenticada e idempotente de mediciones está en desarrollo (Issue #4 - @codsebas).',
    501
  );
});
