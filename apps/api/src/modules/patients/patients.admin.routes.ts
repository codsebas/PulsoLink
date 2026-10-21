import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/index.js';
import { documentId } from '../../shared/persistence.js';
import { sendSuccess } from '../../shared/response.js';
import { webRoute } from '../../shared/web-routes.js';
import { PatientsRepository } from './patients.repository.js';
import { patientDto } from './patient-monitoring.service.js';

const patientFields = {
  code: z.string().trim().min(1).max(32),
  displayName: z.string().trim().min(1).max(120),
};
const createBody = z.object(patientFields).strict();
const updateBody = z.object({ ...patientFields, enabled: z.boolean() }).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'Debe indicar al menos un cambio.');

// Se monta tras el router de lecturas, bajo el mismo /api/v1/patients.
export function createPatientAdminRouter(patients: Pick<PatientsRepository, 'create' | 'update'> = new PatientsRepository()) {
  const router = Router();
  router.post('/', requireRole('admin'), webRoute(async (req, res) => {
    sendSuccess(res, patientDto(await patients.create(createBody.parse(req.body), req.user!.id)), 201);
  }));
  router.patch('/:id', requireRole('admin'), webRoute(async (req, res) => {
    sendSuccess(res, patientDto(await patients.update(documentId.parse(req.params.id), updateBody.parse(req.body), req.user!.id)));
  }));
  return router;
}
