import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { sendError } from '../shared/response.js';
import { PersistenceError } from '../shared/persistence.js';

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

  if (err instanceof PersistenceError) {
    const statusMap: Record<string, number> = {
      IDEMPOTENCY_CONFLICT: 409,
      SESSION_NOT_ACTIVE: 409,
      DEVICE_BUSY: 409,
      INVALID_SESSION_STATE: 409,
      DEVICE_SOURCE_CHANGED: 409,
      PROVISIONING_CONFLICT: 409,
      SESSION_NOT_FOUND: 404,
      DEVICE_NOT_FOUND: 404,
      DEVICE_DISABLED: 401,
      INVALID_CURSOR: 400,
      AUTH_USER_DISABLED: 403,
      RESOURCE_DISABLED: 403,
      DEVICE_ID_MISMATCH: 403,
      PATIENT_NOT_FOUND: 404,
      ASSIGNMENT_NOT_FOUND: 404,
      ASSIGNMENT_CONFLICT: 409,
      ASSIGNMENT_IN_USE: 409,
      ASSIGNMENT_NOT_ACTIVE: 409,
      VALIDATION_ERROR: 400,
      USER_NOT_FOUND: 404,
      USER_OPERATION_NOT_FOUND: 404,
      AUDIT_NOT_FOUND: 404,
      AUTH_SYNC_PENDING: 503,
      NO_CHANGES: 400,
      RATE_LIMITED: 429,
    };
    const statusCode = statusMap[err.code] ?? 400;
    if (err.code === 'RATE_LIMITED') res.setHeader('Retry-After', '1');
    sendError(res, err.code, err.message, statusCode, requestId);
    return;
  }

  // Error de tamaño de payload
  if ('type' in err && (err as { type: string }).type === 'entity.too.large') {
    sendError(res, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la solicitud excede el límite permitido (8 KiB).', 413, requestId);
    return;
  }

  // Auth (Issue #10): JSON malformado enviado por el cliente.
  if ('type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    sendError(res, 'VALIDATION_ERROR', 'El cuerpo de la petición no es JSON válido.', 400, requestId);
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
