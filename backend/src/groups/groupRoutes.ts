import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import { INTEREST_TAGS } from '../shared/interestTags';
import { INVITE_CODE_LENGTH, type GroupService } from './groupService';

const MAX_VETOES = 100;

const createGroupBody = z.object({ name: z.string().trim().min(1, 'name is required').max(60) });

const joinGroupBody = z.object({
  inviteCode: z.string().trim().toUpperCase().length(INVITE_CODE_LENGTH, `inviteCode must be ${String(INVITE_CODE_LENGTH)} characters`),
});

const preferencesBody = z.object({
  interests: z.array(z.enum(INTEREST_TAGS)).max(INTEREST_TAGS.length).optional(),
  vetoedActivityIds: z
    .array(z.string().refine((id) => isValidObjectId(id), 'must be an activity id'))
    .max(MAX_VETOES)
    .optional(),
});

/**
 * POST   /api/groups
 * GET    /api/groups
 * POST   /api/groups/join
 * GET    /api/groups/:groupId
 * PUT    /api/groups/:groupId/members/me
 * DELETE /api/groups/:groupId/members/:userId
 * DELETE /api/groups/:groupId
 */
export function createGroupRouter(authService: AuthService, groupService: GroupService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.post('/', async (request, response) => {
    const { name } = createGroupBody.parse(request.body);
    response.status(201).json(await groupService.createGroup(authenticatedUserId(response), name));
  });

  router.get('/', async (_request, response) => {
    response.json({ groups: await groupService.listGroups(authenticatedUserId(response)) });
  });

  router.post('/join', async (request, response) => {
    const { inviteCode } = joinGroupBody.parse(request.body);
    response.json(await groupService.joinGroup(authenticatedUserId(response), inviteCode));
  });

  router.get('/:groupId', async (request, response) => {
    response.json(await groupService.getGroup(authenticatedUserId(response), request.params.groupId));
  });

  router.put('/:groupId/members/me', async (request, response) => {
    const update = preferencesBody.parse(request.body);
    response.json(await groupService.updatePreferences(authenticatedUserId(response), request.params.groupId, update));
  });

  router.delete('/:groupId/members/:userId', async (request, response) => {
    await groupService.removeMember(authenticatedUserId(response), request.params.groupId, request.params.userId);
    response.status(204).end();
  });

  router.delete('/:groupId', async (request, response) => {
    await groupService.deleteGroup(authenticatedUserId(response), request.params.groupId);
    response.status(204).end();
  });

  return router;
}
