import { Router, Request, Response } from 'express';
import { sendError } from '../../shared/response.js';

export const sessionsRouter = Router();

/**
 * Rutas de sesiones asignadas a Didhyer (Issue #5).
 */
sessionsRouter.get('/', (_req: Request, res: Response) => {
  sendError(res, 'NOT_IMPLEMENTED', 'Listar sesiones está en desarrollo (Issue #5 - Didhyer).', 501);
});

sessionsRouter.post('/', (_req: Request, res: Response) => {
  sendError(res, 'NOT_IMPLEMENTED', 'Crear sesión está en desarrollo (Issue #5 - Didhyer).', 501);
});

sessionsRouter.get('/:id', (_req: Request, res: Response) => {
  sendError(res, 'NOT_IMPLEMENTED', 'Detalle de sesión está en desarrollo (Issue #5 - Didhyer).', 501);
});

sessionsRouter.post('/:id/start', (_req: Request, res: Response) => {
  sendError(res, 'NOT_IMPLEMENTED', 'Iniciar sesión está en desarrollo (Issue #5 - Didhyer).', 501);
});

sessionsRouter.post('/:id/finish', (_req: Request, res: Response) => {
  sendError(res, 'NOT_IMPLEMENTED', 'Finalizar sesión está en desarrollo (Issue #5 - Didhyer).', 501);
});

sessionsRouter.get('/:id/latest', (_req: Request, res: Response) => {
  sendError(res, 'NOT_IMPLEMENTED', 'Consulta de última lectura está en desarrollo (Issue #5 - Didhyer).', 501);
});

sessionsRouter.get('/:id/measurements', (_req: Request, res: Response) => {
  sendError(res, 'NOT_IMPLEMENTED', 'Consulta de historial está en desarrollo (Issue #5 - Didhyer).', 501);
});
