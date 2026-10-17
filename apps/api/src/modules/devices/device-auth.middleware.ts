import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { DeviceCredentialsRepository } from './device-credentials.repository.js';
import type { DeviceDocument } from './devices.repository.js';
import { sendError } from '../../shared/response.js';

export interface DeviceAuthVerifier {
  authenticate(bearer: string): Promise<DeviceDocument | null>;
}

declare global {
  namespace Express {
    interface Request {
      device?: DeviceDocument;
    }
  }
}

/**
 * Middleware de autenticación para dispositivos IoT / simulador según el Contrato A.
 * Exige la cabecera `Authorization: Bearer <credentialId>.<secret>`.
 * Compara el secreto mediante hash SHA-256 en tiempo constante y adjunta `req.device`.
 *
 * Rechaza credenciales incorrectas, deshabilitadas, revocadas o dispositivos no habilitados con 401.
 */
export function createDeviceAuthMiddleware(
  verifier: DeviceAuthVerifier = new DeviceCredentialsRepository()
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        sendError(
          res,
          'UNAUTHORIZED',
          'Cabecera Authorization: Bearer <credentialId>.<secret> requerida.',
          401
        );
        return;
      }

      const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
      if (!match) {
        sendError(
          res,
          'UNAUTHORIZED',
          'Formato de autorización inválido. Debe ser Bearer <credentialId>.<secret>.',
          401
        );
        return;
      }

      const token = match[1];
      const device = await verifier.authenticate(token);
      if (!device) {
        sendError(
          res,
          'UNAUTHORIZED',
          'Credencial de dispositivo inválida, deshabilitada o revocada.',
          401
        );
        return;
      }

      req.device = device;
      next();
    } catch (error) {
      next(error);
    }
  };
}
