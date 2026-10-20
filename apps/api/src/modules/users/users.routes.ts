import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/index.js';
import { documentId } from '../../shared/persistence.js';
import { sendSuccess } from '../../shared/response.js';
import { pageQueryFields, webRoute } from '../../shared/web-routes.js';
import { userDto } from './users.repository.js';
import { UsersService } from './users.service.js';

const listQuery = z.object({
  limit: pageQueryFields.limit,
  cursor: pageQueryFields.cursor,
  enabled: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
}).strict();

const createBody = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(['admin', 'viewer']),
}).strict();

const updateBody = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['admin', 'viewer']).optional(),
  enabled: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export function createUsersRouter(service = new UsersService()): Router {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/', webRoute(async (req, res) => {
    const page = await service.list(listQuery.parse(req.query));
    sendSuccess(res, page.data.map(userDto), 200, { pagination: page.pagination });
  }));

  router.get('/:id', webRoute(async (req, res) => {
    sendSuccess(res, await service.get(documentId.parse(req.params.id)));
  }));

  router.post('/', webRoute(async (req, res) => {
    const user = await service.create(createBody.parse(req.body), req.user!.id);
    sendSuccess(res, user, 201);
  }));

  router.patch('/:id', webRoute(async (req, res) => {
    const user = await service.update(
      documentId.parse(req.params.id),
      updateBody.parse(req.body),
      req.user!.id,
    );
    sendSuccess(res, user);
  }));

  return router;
}

export const usersRouter = createUsersRouter();
