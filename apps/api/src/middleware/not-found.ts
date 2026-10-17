import { Request, Response } from 'express';
import { sendError } from '../shared/response.js';

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = (req.headers['x-request-id'] as string) || `req-${Date.now()}`;
  sendError(res, 'NOT_FOUND', `La ruta ${req.method} ${req.originalUrl} no existe.`, 404, requestId);
}
