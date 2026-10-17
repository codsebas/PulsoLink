import { createDeviceMeasurementsRouter } from './device-measurements.router.js';

/**
 * Router activo para los endpoints del Contrato A bajo `/api/v1/device` (Issue #4 - @codsebas):
 * - GET /api/v1/device/config
 * - POST /api/v1/device/heartbeat
 * - POST /api/v1/device/measurements
 */
export const deviceMeasurementsRouter = createDeviceMeasurementsRouter();
