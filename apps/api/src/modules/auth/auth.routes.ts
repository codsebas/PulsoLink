import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { sendSuccess, sendError } from '../../shared/response.js';

export const authRouter = Router();

/**
 * GET /api/v1/auth/csrf
 * Entrega un token CSRF inicial para que el frontend pueda enviar mutaciones.
 */
authRouter.get('/csrf', (_req: Request, res: Response) => {
  const csrfToken = crypto.randomBytes(24).toString('hex');
  sendSuccess(res, { csrfToken });
});

/**
 * POST /api/v1/auth/login
 * Punto de integración asignado a @Mar-03 (Issue #10).
 */
authRouter.post('/login', (_req: Request, res: Response) => {
  sendError(
    res,
    'NOT_IMPLEMENTED',
    'El flujo de inicio de sesión con Firebase Auth y cookie HttpOnly está en desarrollo (Issue #10 - @Mar-03).',
    501
  );
});

/**
 * POST /api/v1/auth/logout
 * Punto de integración asignado a @Mar-03 (Issue #10).
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  sendError(
    res,
    'NOT_IMPLEMENTED',
    'El flujo de cierre de sesión está en desarrollo (Issue #10 - @Mar-03).',
    501
  );
});

/**
 * GET /api/v1/auth/me
 * Punto de integración asignado a @Mar-03 (Issue #10).
 */
authRouter.get('/me', (_req: Request, res: Response) => {
  sendError(
    res,
    'NOT_IMPLEMENTED',
    'La consulta de usuario actual está en desarrollo (Issue #10 - @Mar-03).',
    501
  );
});
