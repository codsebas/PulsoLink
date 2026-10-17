import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../shared/response.js';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || `req-${Date.now()}`;

  if (err instanceof AppError) {
    sendError(res, err.code, err.message, err.statusCode, requestId, err.details);
    return;
  }

  if (err instanceof ZodError) {
    const formatted = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    sendError(res, 'VALIDATION_ERROR', 'Los datos proporcionados no son válidos.', 400, requestId, formatted);
    return;
  }

  // Error de tamaño de payload
  if ('type' in err && (err as { type: string }).type === 'entity.too.large') {
    sendError(res, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la solicitud excede el límite permitido (8 KiB).', 413, requestId);
    return;
  }

  console.error(`[UnhandledError] ${req.method} ${req.originalUrl}:`, err);

  sendError(
    res,
    'INTERNAL_SERVER_ERROR',
    'Ha ocurrido un error interno en el servidor.',
    500,
    requestId
  );
}
