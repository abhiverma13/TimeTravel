import { Router } from 'express';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import type { FriendService } from './friendService';

const searchQuery = z.object({ search: z.string().trim().min(2, 'search must be at least 2 characters').max(60) });

/**
 * GET /api/travellers?search=<text>
 * GET /api/travellers/:userId
 *
 * Finding travellers has its own routes; the Friend Service still answers, since it alone decides what of a traveller
 * (home city, posts) the caller may see.
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
