import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

import { INTEREST_TAGS } from '../activities/interests';
import type { AuthService } from '../auth/authService';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import { PACES, TRANSPORT_MODES } from './engine/types';
import { MAX_TRIP_DAYS, type ItineraryService } from './itineraryService';
import { isClockTime, isIsoDate, minutesFromClock, tripLengthDays } from './tripCalendar';
import { BUDGETS } from './tripOptions';

/** The traveller needs at least this long out each day for a plan to make sense. */
const MIN_DAY_MINUTES = 120;

const isoDate = z.string().refine(isIsoDate, 'must be a date written YYYY-MM-DD');
const clockTime = z.string().refine(isClockTime, 'must be a time written HH:MM');
const groupId = z.string().refine((id) => isValidObjectId(id), 'must be a group id');
const activityId = z.string().refine((id) => isValidObjectId(id), 'must be an activity id');
const MAX_MUST_SEE = 10;
const MAX_AVOID = 50;

const generateItineraryBody = z
  .object({
    city: z.string().trim().min(1, 'city is required').max(80),
    startDate: isoDate,
    endDate: isoDate,
    dayStart: clockTime.default('09:00'),
    dayEnd: clockTime.default('18:00'),
    arrivalTime: clockTime.optional(),
    departureTime: clockTime.optional(),
    interests: z.array(z.enum(INTEREST_TAGS)).max(INTEREST_TAGS.length).default([]),
    pace: z.enum(PACES).default('moderate'),
    lodging: z.string().trim().max(120).optional(),
    groupId: groupId.optional(),
    transportMode: z.enum(TRANSPORT_MODES).default('transit'),
    budget: z.enum(BUDGETS).default('any'),
    mustSeeIds: z.array(activityId).max(MAX_MUST_SEE).default([]),
    avoidIds: z.array(activityId).max(MAX_AVOID).default([]),
  })
  .superRefine((body, context) => {
    if (body.endDate < body.startDate) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must not be before startDate' });
    } else if (tripLengthDays(body.startDate, body.endDate) > MAX_TRIP_DAYS) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: `trips can be at most ${String(MAX_TRIP_DAYS)} days` });
    }
    if (body.mustSeeIds.some((id) => body.avoidIds.includes(id))) {
      context.addIssue({ code: 'custom', path: ['avoidIds'], message: 'an activity cannot be both a must-see and avoided' });
    }
    if (minutesFromClock(body.dayEnd) - minutesFromClock(body.dayStart) < MIN_DAY_MINUTES) {
      context.addIssue({ code: 'custom', path: ['dayEnd'], message: 'dayEnd must be at least 2 hours after dayStart' });
    }
  });

const listQuery = z.object({ groupId: groupId.optional() });

const adjustment = { version: z.number().int().min(0), dayIndex: z.number().int().min(0) };
const adjustBody = z.union([
  z.object({ action: z.enum(['lock', 'unlock', 'remove', 'add']), ...adjustment, activityId }),
  z.object({ action: z.literal('move'), ...adjustment, activityId, toIndex: z.number().int().min(0) }),
  z.object({ action: z.literal('replan'), ...adjustment, fromTime: clockTime.optional() }),
]);

/**
 * POST /api/itineraries/generate
 * GET  /api/itineraries?groupId=
 * GET  /api/itineraries/:itineraryId
 * POST /api/itineraries/:itineraryId/adjust
 */
export function createItineraryRouter(authService: AuthService, itineraryService: ItineraryService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.post('/generate', async (request, response) => {
    const input = generateItineraryBody.parse(request.body);
    response.status(201).json(await itineraryService.generateItinerary(authenticatedUserId(response), input));
  });

  router.get('/', async (request, response) => {
    const query = listQuery.parse(request.query);
    response.json({ itineraries: await itineraryService.listItineraries(authenticatedUserId(response), query.groupId) });
  });

  router.get('/:itineraryId', async (request, response) => {
    response.json(await itineraryService.getItinerary(authenticatedUserId(response), request.params.itineraryId));
  });

  router.post('/:itineraryId/adjust', async (request, response) => {
    const change = adjustBody.parse(request.body);
    response.json(await itineraryService.adjustItinerary(authenticatedUserId(response), request.params.itineraryId, change));
  });

  return router;
}
