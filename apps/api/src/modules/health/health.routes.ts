import { Router, Request, Response } from 'express';
import { getFirebaseStatus } from '../../config/firebase.js';

export const healthRouter = Router();

/**
 * GET /api/v1/health
 * Comprueba el estado del proceso del backend.
 * Nota: Informa honestamente si Firebase Admin está inicializado o pendiente.
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  const firebaseStatus = getFirebaseStatus();

  res.status(200).json({
    status: 'ok',
    service: 'pulsolink-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    firebase: {
      configured: firebaseStatus.configured,
      mode: firebaseStatus.mode,
      ...(firebaseStatus.error && { message: firebaseStatus.error }),
    },
  });
});
