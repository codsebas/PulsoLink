import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
// Auth (Issue #10): middlewares reales de autenticación y CSRF.
import { requireUser, csrfProtection } from './modules/auth/index.js';
import { devicesRouter } from './modules/devices/devices.routes.js';
import { sessionsRouter } from './modules/sessions/sessions.routes.js';
import { deviceMeasurementsRouter } from './modules/measurements/measurements.routes.js';
import { createPatientReadRouter } from './modules/patients/patients.read.routes.js';

export function createApp(): Express {
  const app = express();

  // Seguridad y cabeceras
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );

  // Límite de carga útil acorde al contrato (8 KiB)
  app.use(express.json({ limit: '8kb' }));
  app.use(cookieParser());

  // Rutas base API v1
  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', authRouter);
  // Auth (Issue #10): las rutas web exigen usuario; las mutaciones exigen CSRF.
  app.use('/api/v1/devices', requireUser, devicesRouter);
  app.use('/api/v1/patients', requireUser, createPatientReadRouter());
  app.use('/api/v1/sessions', requireUser, csrfProtection, sessionsRouter);
  app.use('/api/v1/device', deviceMeasurementsRouter);

  // Manejador 404 para rutas no encontradas
  app.use(notFoundHandler);

  // Manejador centralizado de errores
  app.use(errorHandler);

  return app;
}
