import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/index.js';
import { AppError } from '../../middleware/error-handler.js';
import { PersistenceError, documentId } from '../../shared/persistence.js';
import { sendSuccess } from '../../shared/response.js';
import { webRoute } from '../../shared/web-routes.js';
import { DevicesRepository } from './devices.repository.js';
import { deviceDto } from './devices.routes.js';

const code = z.string().trim().min(1).max(32);
const hardwareId = z.string().min(1).max(128);
const createBody = z.object({ code, hardwareId: hardwareId.optional(), source: z.enum(['real', 'simulated']) }).strict();
const updateBody = z.object({ code, hardwareId, enabled: z.boolean() }).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'Debe indicar al menos un cambio.');

export function createDeviceAdminRouter(devices: Pick<DevicesRepository, 'getById' | 'create' | 'update'> = new DevicesRepository()) {
  const router = Router();
  router.get('/:id', requireRole('admin', 'viewer'), webRoute(async (req, res) => {
    const device = await devices.getById(documentId.parse(req.params.id));
    if (!device) throw new PersistenceError('DEVICE_NOT_FOUND', 'Dispositivo no encontrado.');
    if (!device.enabled && req.user!.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Solo administración consulta placas deshabilitadas.', 403);
    }
    sendSuccess(res, deviceDto(device));
  }));
  router.post('/', requireRole('admin'), webRoute(async (req, res) => {
    sendSuccess(res, deviceDto(await devices.create(createBody.parse(req.body), req.user!.id)), 201);
  }));
  router.patch('/:id', requireRole('admin'), webRoute(async (req, res) => {
    sendSuccess(res, deviceDto(await devices.update(documentId.parse(req.params.id), updateBody.parse(req.body), req.user!.id)));
  }));
  return router;
}
