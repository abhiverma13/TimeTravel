import { Router } from 'express';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import type { DisruptionService } from './disruptionService';

const listQuery = z.object({ itineraryId: z.string().min(1, 'itineraryId is required') });

/**
 * GET  /api/suggestions?itineraryId=<id>
 * POST /api/suggestions/:suggestionId/accept
 * POST /api/suggestions/:suggestionId/dismiss
 */
export function createSuggestionRouter(authService: AuthService, disruptionService: DisruptionService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.get('/', async (request, response) => {
    const { itineraryId } = listQuery.parse(request.query);
    response.json({ suggestions: await disruptionService.listSuggestions(authenticatedUserId(response), itineraryId) });
  });

  router.post('/:suggestionId/accept', async (request, response) => {
    response.json(await disruptionService.accept(authenticatedUserId(response), request.params.suggestionId));
  });

  router.post('/:suggestionId/dismiss', async (request, response) => {
    await disruptionService.dismiss(authenticatedUserId(response), request.params.suggestionId);
    response.status(204).end();
  });

  return router;
}
