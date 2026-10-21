import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { PersistenceError, documentId } from '../../shared/persistence.js';
import { sendSuccess, sendError } from '../../shared/response.js';
import { createDeviceAuthMiddleware, type DeviceAuthVerifier } from '../devices/device-auth.middleware.js';
import { DeviceCredentialsRepository } from '../devices/device-credentials.repository.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import {
  MeasurementsRepository,
  patientMeasurementInputSchema,
} from './measurements.repository.js';

export const heartbeatInputSchema = z
  .object({
    deviceId: documentId,
    bootId: z.string().uuid('bootId debe ser un UUID válido'),
    uptimeMs: z.number().int().min(0, 'uptimeMs debe ser un entero no negativo'),
    firmwareVersion: z.string().min(1).max(64).optional(),
  })
  .strict();

export interface DeviceMeasurementsRouterDeps {
  credentialsRepo: DeviceAuthVerifier;
  devicesRepo: Pick<DevicesRepository, 'getById' | 'heartbeat'>;
  measurementsRepo: Pick<MeasurementsRepository, 'ingest'>;
}

/**
 * Crea el router Express para los endpoints del Contrato A bajo `/api/v1/device`:
 * - GET /api/v1/device/config
 * - POST /api/v1/device/heartbeat
 * - POST /api/v1/device/measurements
 *
 * Todas las rutas exigen autenticación mediante `Authorization: Bearer <credentialId>.<secret>`.
 */
export function createDeviceMeasurementsRouter(
  deps?: Partial<DeviceMeasurementsRouterDeps>
): Router {
  const credentialsRepo = deps?.credentialsRepo ?? new DeviceCredentialsRepository();
  const devicesRepo = deps?.devicesRepo ?? new DevicesRepository();
  const measurementsRepo = deps?.measurementsRepo ?? new MeasurementsRepository();

  const router = Router();
  const authenticateDevice = createDeviceAuthMiddleware(credentialsRepo);

  router.use(authenticateDevice);

  /**
   * GET /api/v1/device/config
   * Devuelve la configuración de intervalos y la sesión activa si existe.
   * No expone secretos ni hashes de credenciales.
   */
  router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentDevice = req.device!;
      const freshDevice = await devicesRepo.getById(currentDevice.deviceId);
      if (!freshDevice || !freshDevice.enabled) {
        sendError(res, 'UNAUTHORIZED', 'Dispositivo no encontrado o deshabilitado.', 401);
        return;
      }

      sendSuccess(res, {
        deviceId: freshDevice.deviceId,
        activeSessionId: freshDevice.activeSessionId ?? null,
        uploadIntervalMs: 2000,
        heartbeatIntervalMs: 15000,
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/v1/device/heartbeat
   * Registra el latido de presencia y actualiza lastSeenAt en el dispositivo.
   */
  router.post('/heartbeat', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentDevice = req.device!;
      const payload = heartbeatInputSchema.parse(req.body);
      if (payload.deviceId !== currentDevice.deviceId) {
        throw new PersistenceError('DEVICE_ID_MISMATCH', 'La identidad declarada no coincide con la credencial.');
      }
      const serverTime = await devicesRepo.heartbeat(currentDevice.deviceId);
      sendSuccess(res, { serverTime });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/v1/device/measurements
   * Recepción autenticada e idempotente de signos vitales (pulso, SpO2, temperatura de contacto).
   * Devuelve 201 en primera inserción exitosa.
   * Devuelve 200 con duplicate = true en reintento idéntico.
   * Devuelve 409 en conflicto de idempotencia o si la sesión no está activa.
   */
  router.post('/measurements', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentDevice = req.device!;
      const parsed = patientMeasurementInputSchema.parse(req.body);
      if (parsed.deviceId !== currentDevice.deviceId) {
        throw new PersistenceError('DEVICE_ID_MISMATCH', 'La identidad declarada no coincide con la credencial.');
      }
      const result = await measurementsRepo.ingest(currentDevice.deviceId, parsed);
      const statusCode = result.duplicate ? 200 : 201;
      sendSuccess(res, result, statusCode);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
