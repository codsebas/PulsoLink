import { Response } from 'express';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
  pagination?: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  extra?: { meta?: Record<string, unknown>; pagination?: { nextCursor: string | null; hasMore: boolean } }
): Response {
  const payload: ApiSuccessResponse<T> = { data };
  if (extra?.meta) payload.meta = extra.meta;
  if (extra?.pagination) payload.pagination = extra.pagination;
  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 400,
  requestId?: string,
  details?: unknown
): Response {
  const payload: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(requestId && { requestId }),
      ...(details !== undefined && { details }),
    },
  };
  return res.status(statusCode).json(payload);
}
