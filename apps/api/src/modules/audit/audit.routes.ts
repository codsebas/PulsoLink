import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/index.js';
import { documentId } from '../../shared/persistence.js';
import { sendSuccess } from '../../shared/response.js';
import { pageQueryFields, webRoute } from '../../shared/web-routes.js';
import { AuditRepository, auditAction, auditTargetType } from './audit.repository.js';

const listQuery = z.object({
  limit: pageQueryFields.limit,
  cursor: pageQueryFields.cursor,
  from: pageQueryFields.from,
  to: pageQueryFields.to,
  actorId: documentId.optional(),
  action: auditAction.optional(),
  targetType: auditTargetType.optional(),
  targetId: documentId.optional(),
}).strict().refine(
  (value) => !value.from || !value.to || value.from < value.to,
  'Intervalo inválido',
);

export function createAuditRouter(repository = new AuditRepository()): Router {
  const router = Router();
  router.use(requireRole('admin'));
  router.get('/', webRoute(async (req, res) => {
    const options = listQuery.parse(req.query);
    const page = await repository.list(options);
    const data = page.data.map((event) => ({
      id: event.id,
      actorId: event.actorId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      occurredAt: event.occurredAt,
      result: event.result,
      context: event.context,
    }));
    sendSuccess(res, data, 200, { pagination: page.pagination });
  }));
  return router;
}

export const auditRouter = createAuditRouter();
