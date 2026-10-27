import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import type { NearbyService } from './nearbyService';

const MAX_NOTE_LENGTH = 200;

const position = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const openBody = z.object({ openToJoin: z.boolean() });

const requestBody = z.object({ note: z.string().trim().max(MAX_NOTE_LENGTH).default('') });

const requestsQuery = z.object({ groupId: z.string().refine((id) => isValidObjectId(id), 'must be a group id') });

/**
 * GET  /api/nearby/trips?lat=<lat>&lng=<lng>
 * PUT  /api/nearby/trips/:itineraryId
 * POST /api/nearby/trips/:itineraryId/requests
 * GET  /api/nearby/requests?groupId=<id>
 * POST /api/nearby/requests/:requestId/accept
 * POST /api/nearby/requests/:requestId/decline
 */
export function createNearbyRouter(authService: AuthService, nearbyService: NearbyService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.get('/trips', async (request, response) => {
    const point = position.parse(request.query);
    response.json({ trips: await nearbyService.findNearby(authenticatedUserId(response), point) });
  });

  router.put('/trips/:itineraryId', async (request, response) => {
    const { openToJoin } = openBody.parse(request.body);
    response.json(await nearbyService.setOpen(authenticatedUserId(response), request.params.itineraryId, openToJoin));
  });

  router.post('/trips/:itineraryId/requests', async (request, response) => {
    const { note } = requestBody.parse(request.body);
    response.status(201).json(await nearbyService.requestToJoin(authenticatedUserId(response), request.params.itineraryId, note));
  });

  router.get('/requests', async (request, response) => {
    const { groupId } = requestsQuery.parse(request.query);
    response.json({ requests: await nearbyService.listRequests(authenticatedUserId(response), groupId) });
  });

  router.post('/requests/:requestId/accept', async (request, response) => {
    response.json(await nearbyService.answer(authenticatedUserId(response), request.params.requestId, true));
  });

  router.post('/requests/:requestId/decline', async (request, response) => {
    response.json(await nearbyService.answer(authenticatedUserId(response), request.params.requestId, false));
  });

  return router;
}
