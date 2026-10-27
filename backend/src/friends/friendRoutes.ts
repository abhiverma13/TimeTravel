import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import type { FriendService } from './friendService';

const searchQuery = z.object({ search: z.string().trim().min(2, 'search must be at least 2 characters').max(60) });

const friendRequestBody = z.object({ userId: z.string().refine((id) => isValidObjectId(id), 'must be a user id') });

const privacyBody = z.object({ isPrivate: z.boolean() });

/**
 * GET /api/travellers?search=<text>
 * GET /api/travellers/:userId
 */
export function createTravellerRouter(authService: AuthService, friendService: FriendService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.get('/', async (request, response) => {
    const { search } = searchQuery.parse(request.query);
    response.json({ travellers: await friendService.searchTravellers(authenticatedUserId(response), search) });
  });

  router.get('/:userId', async (request, response) => {
    response.json(await friendService.getTraveller(authenticatedUserId(response), request.params.userId));
  });

  return router;
}

/**
 * GET    /api/friends
 * POST   /api/friends/requests
 * POST   /api/friends/requests/:userId/accept
 * DELETE /api/friends/:userId
 * PUT    /api/friends/privacy
 */
export function createFriendRouter(authService: AuthService, friendService: FriendService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.get('/', async (_request, response) => {
    response.json(await friendService.listFriends(authenticatedUserId(response)));
  });

  router.post('/requests', async (request, response) => {
    const { userId } = friendRequestBody.parse(request.body);
    const { traveller, created } = await friendService.sendRequest(authenticatedUserId(response), userId);
    response.status(created ? 201 : 200).json(traveller);
  });

  router.post('/requests/:userId/accept', async (request, response) => {
    response.json(await friendService.acceptRequest(authenticatedUserId(response), request.params.userId));
  });

  router.put('/privacy', async (request, response) => {
    const { isPrivate } = privacyBody.parse(request.body);
    response.json(await friendService.setPrivacy(authenticatedUserId(response), isPrivate));
  });

  router.delete('/:userId', async (request, response) => {
    await friendService.removeFriendship(authenticatedUserId(response), request.params.userId);
    response.status(204).end();
  });

  return router;
}
