import { Router } from 'express';
import { DevicesRepository, type DeviceDocument } from './devices.repository.js';
import { AppError } from '../../middleware/error-handler.js';
import { devicePageQuery, webRoute } from '../../shared/web-routes.js';
import { sendSuccess } from '../../shared/response.js';

export function deviceDto(device: DeviceDocument) {
  const { deviceId, code, hardwareId, source, enabled, activeSessionId, lastSeenAt } = device;
  return { id: deviceId, code, ...(hardwareId ? { hardwareId } : {}), source, enabled, activeSessionId, lastSeenAt };
}

export function createDevicesRouter(devices: Pick<DevicesRepository, 'list'> = new DevicesRepository()): Router {
  const router = Router();
  router.get('/', webRoute(async (req, res) => {
    const { limit, cursor, enabled } = devicePageQuery.parse(req.query);
    if (enabled === false && req.user?.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Solo administración consulta placas deshabilitadas.', 403);
    }
    const page = await devices.list({ limit, cursor, ...(enabled === undefined ? {} : { enabled }) });
    sendSuccess(res, page.data.map(deviceDto), 200, { pagination: page.pagination });
  }));
  return router;
}

export const devicesRouter = createDevicesRouter();
