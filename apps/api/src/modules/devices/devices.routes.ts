import { Router } from 'express';
import { DevicesRepository, type DeviceDocument } from './devices.repository.js';
import { devicePageQuery, webRoute } from '../../shared/web-routes.js';
import { sendSuccess } from '../../shared/response.js';

function deviceDto(device: DeviceDocument) {
  const { deviceId, code, board, source, activeSessionId, lastSeenAt } = device;
  return { id: deviceId, code, board, source, activeSessionId, lastSeenAt };
}

export function createDevicesRouter(devices: Pick<DevicesRepository, 'list'> = new DevicesRepository()): Router {
  const router = Router();
  router.get('/', webRoute(async (req, res) => {
    const { limit, cursor } = devicePageQuery.parse(req.query);
    const page = await devices.list({ limit, cursor });
    sendSuccess(res, page.data.map(deviceDto), 200, { pagination: page.pagination });
  }));
  return router;
}

export const devicesRouter = createDevicesRouter();
