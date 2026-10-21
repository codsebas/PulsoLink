import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/error-handler.js';
import { documentId } from '../../shared/persistence.js';
import { sendSuccess } from '../../shared/response.js';
import { pageQuery, sessionListQuery, webRoute } from '../../shared/web-routes.js';
import { SessionsService } from './sessions.service.js';
import { requireRole } from '../auth/index.js';

const createBody = z.object({ assignmentId: documentId }).strict();
const emptyBody = z.object({}).strict();

function authenticatedUser(req: Express.Request) {
  if (!req.user) throw new AppError('UNAUTHENTICATED', 'No hay una sesión activa.', 401);
  return req.user;
}

export function createSessionsRouter(service = new SessionsService()): Router {
  const router = Router();
  router.use(requireRole('admin', 'viewer'));

  router.get('/', webRoute(async (req, res) => {
    const page = await service.list(sessionListQuery.parse(req.query), authenticatedUser(req));
    sendSuccess(res, page.data, 200, { pagination: page.pagination });
  }));

  router.post('/', requireRole('admin'), webRoute(async (req, res) => {
    const session = await service.create(createBody.parse(req.body), authenticatedUser(req));
    sendSuccess(res, session, 201);
  }));

  router.get('/:id', webRoute(async (req, res) => {
    sendSuccess(res, await service.get(documentId.parse(req.params.id), authenticatedUser(req)));
  }));

  router.post('/:id/start', requireRole('admin'), webRoute(async (req, res) => {
    emptyBody.parse(req.body ?? {});
    sendSuccess(res, await service.transition(documentId.parse(req.params.id), authenticatedUser(req), 'active'));
  }));

  router.post('/:id/finish', requireRole('admin'), webRoute(async (req, res) => {
    emptyBody.parse(req.body ?? {});
    sendSuccess(res, await service.transition(documentId.parse(req.params.id), authenticatedUser(req), 'finished'));
  }));

  router.get('/:id/latest', webRoute(async (req, res) => {
    const result = await service.latest(documentId.parse(req.params.id), authenticatedUser(req));
    sendSuccess(res, result.data, 200, { meta: result.meta });
  }));

  router.get('/:id/measurements', webRoute(async (req, res) => {
    const page = await service.measurements(documentId.parse(req.params.id), authenticatedUser(req), pageQuery.parse(req.query));
    sendSuccess(res, page.data, 200, { pagination: page.pagination });
  }));

  return router;
}

export const sessionsRouter = createSessionsRouter();
