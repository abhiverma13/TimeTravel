import { Router } from 'express';
import { z } from 'zod';

import { INTEREST_TAGS } from '../activities/interests';
import type { AuthService } from '../auth/authService';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import { PACES } from './engine/types';
import { MAX_TRIP_DAYS, type ItineraryService } from './itineraryService';
import { isClockTime, isIsoDate, minutesFromClock, tripLengthDays } from './tripCalendar';

/** The traveller needs at least this long out each day for a plan to make sense. */
const MIN_DAY_MINUTES = 120;

const isoDate = z.string().refine(isIsoDate, 'must be a date written YYYY-MM-DD');
const clockTime = z.string().refine(isClockTime, 'must be a time written HH:MM');

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
  })
  .superRefine((body, context) => {
    if (body.endDate < body.startDate) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must not be before startDate' });
    } else if (tripLengthDays(body.startDate, body.endDate) > MAX_TRIP_DAYS) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: `trips can be at most ${String(MAX_TRIP_DAYS)} days` });
    }
    if (minutesFromClock(body.dayEnd) - minutesFromClock(body.dayStart) < MIN_DAY_MINUTES) {
      context.addIssue({ code: 'custom', path: ['dayEnd'], message: 'dayEnd must be at least 2 hours after dayStart' });
    }
  });

/**
 * POST /api/itineraries/generate
 * GET  /api/itineraries
 * GET  /api/itineraries/:itineraryId
 */
export function createItineraryRouter(authService: AuthService, itineraryService: ItineraryService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.post('/generate', async (request, response) => {
    const input = generateItineraryBody.parse(request.body);
    response.status(201).json(await itineraryService.generateItinerary(authenticatedUserId(response), input));
  });

  router.get('/', async (_request, response) => {
    response.json({ itineraries: await itineraryService.listItineraries(authenticatedUserId(response)) });
  });

  router.get('/:itineraryId', async (request, response) => {
    response.json(await itineraryService.getItinerary(authenticatedUserId(response), request.params.itineraryId));
  });

  return router;
}
