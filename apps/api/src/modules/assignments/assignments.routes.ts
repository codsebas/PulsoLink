import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/index.js';
import { documentId, PersistenceError } from '../../shared/persistence.js';
import { pageQueryFields, webRoute } from '../../shared/web-routes.js';
import { sendSuccess } from '../../shared/response.js';
import { AssignmentsRepository, type AssignmentDocument } from './assignments.repository.js';

function assignmentDto(assignment: AssignmentDocument) {
  const { id, patientId, deviceId, startedAt, endedAt, assignedBy, endedBy } = assignment;
  return { id, patientId, deviceId, startedAt, endedAt, assignedBy, endedBy };
}

const listQuery = z.object({ ...pageQueryFields,
  patientId: documentId.optional(), deviceId: documentId.optional(),
  status: z.enum(['active', 'closed']).optional(),
}).strict().refine((value) => !value.from || !value.to || value.from < value.to, 'Intervalo inválido');
const createBody = z.object({ patientId: documentId, deviceId: documentId }).strict();
const emptyBody = z.object({}).strict();

export function createAssignmentsRouter(assignments: Pick<AssignmentsRepository, 'list' | 'getById' | 'create' | 'close'> = new AssignmentsRepository()) {
  const router = Router();
  router.get('/', requireRole('admin', 'viewer'), webRoute(async (req, res) => {
    const page = await assignments.list(listQuery.parse(req.query));
    sendSuccess(res, page.data.map(assignmentDto), 200, { pagination: page.pagination });
  }));
  router.post('/', requireRole('admin'), webRoute(async (req, res) => {
    sendSuccess(res, assignmentDto(await assignments.create(createBody.parse(req.body), req.user!.id)), 201);
  }));
  router.get('/:id', requireRole('admin', 'viewer'), webRoute(async (req, res) => {
    const assignment = await assignments.getById(documentId.parse(req.params.id));
    if (!assignment) throw new PersistenceError('ASSIGNMENT_NOT_FOUND', 'Asignación no encontrada.');
    sendSuccess(res, assignmentDto(assignment));
  }));
  router.post('/:id/close', requireRole('admin'), webRoute(async (req, res) => {
    emptyBody.parse(req.body ?? {});
    sendSuccess(res, assignmentDto(await assignments.close(documentId.parse(req.params.id), req.user!.id)));
  }));
  return router;
}
