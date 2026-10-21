import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { documentId } from '../../shared/persistence.js';
import { pageQuery, webRoute } from '../../shared/web-routes.js';
import { sendSuccess } from '../../shared/response.js';
import { AppError } from '../../middleware/error-handler.js';
import { PatientMonitoringService, patientDto } from './patient-monitoring.service.js';
import { csrfProtection } from '../auth/index.js';

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().max(4096).optional(), enabled: z.enum(['true', 'false']).transform((value) => value === 'true').optional() }).strict();
export function createPatientReadRouter(service = new PatientMonitoringService(), csrf: RequestHandler = csrfProtection) {
  const router = Router();
  async function visiblePatient(id: string, req: Request) {
    const patient = await service.get(id);
    if (!patient.enabled && req.user!.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Solo administración consulta pacientes deshabilitados.', 403);
    }
    return patient;
  }
  router.use((req, _res, next) => {
    if (!req.user) return next(new AppError('UNAUTHENTICATED', 'No hay una sesión activa.', 401));
    if (req.user.role !== 'admin' && req.user.role !== 'viewer') return next(new AppError('FORBIDDEN', 'Se requiere rol admin o viewer.', 403));
    next();
  });
  router.get('/', webRoute(async (req, res) => {
    const options = listQuery.parse(req.query);
    if (options.enabled === false && req.user!.role !== 'admin') throw new AppError('FORBIDDEN', 'Solo administración consulta pacientes deshabilitados.', 403);
    const page = await service.patients.list(options);
    sendSuccess(res, page.data.map(patientDto), 200, { pagination: page.pagination });
  }));
  router.get('/:id', webRoute(async (req, res) => { sendSuccess(res, patientDto(await visiblePatient(documentId.parse(req.params.id), req))); }));
  router.get('/:id/latest', webRoute(async (req, res) => {
    const id = documentId.parse(req.params.id);
    await visiblePatient(id, req);
    const result = await service.latest(id);
    sendSuccess(res, result.data, 200, { meta: result.meta });
  }));
  router.get('/:id/measurements', webRoute(async (req, res) => {
    const id = documentId.parse(req.params.id);
    await visiblePatient(id, req);
    const page = await service.measurements.listByPatient(id, pageQuery.parse(req.query));
    sendSuccess(res, page.data, 200, { pagination: page.pagination });
  }));
  router.post('/:id/access', csrf, webRoute(async (req, res) => {
    const id = documentId.parse(req.params.id);
    const { viewId } = z.object({ viewId: z.string().uuid() }).strict().parse(req.body);
    await visiblePatient(id, req);
    const result = await service.audit.recordPatientAccess(req.user!.id, id, viewId);
    sendSuccess(res, result, result.duplicate ? 200 : 201);
  }));
  return router;
}
