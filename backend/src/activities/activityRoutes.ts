import { Router } from 'express';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import type { ActivityService } from './activityService';
import { INTEREST_TAGS } from './interests';
import { MAX_REVIEW_COMMENT_LENGTH } from './reviewModel';
import { BEST_TIMES, COST_LEVELS, MAX_REPORTED_DURATION, MIN_REPORTED_DURATION, SETTINGS } from './reviewTags';

const listActivitiesQuery = z.object({
  city: z.string().trim().min(1, 'city is required').max(80),
  interest: z.enum(INTEREST_TAGS).optional(),
});

const reviewBody = z.object({
  rating: z.number().int('rating must be a whole number of stars').min(1).max(5),
  comment: z.string().trim().max(MAX_REVIEW_COMMENT_LENGTH).default(''),
  tags: z
    .object({
      durationMinutes: z.number().int().min(MIN_REPORTED_DURATION).max(MAX_REPORTED_DURATION).optional(),
      bestTimeOfDay: z.enum(BEST_TIMES).optional(),
      cost: z.enum(COST_LEVELS).optional(),
      setting: z.enum(SETTINGS).optional(),
    })
    .default({}),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
});

/**
 * GET  /api/activities?city=<city>[&interest=<tag>]
 * POST /api/activities/:activityId/reviews
 * GET  /api/activities/:activityId/reviews
 */
export function createActivityRouter(authService: AuthService, activityService: ActivityService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.get('/', async (request, response) => {
    const { city, interest } = listActivitiesQuery.parse(request.query);
    response.json({ city, activities: await activityService.listActivities(city, interest) });
  });

  router.post('/:activityId/reviews', async (request, response) => {
    const input = reviewBody.parse(request.body);
    const result = await activityService.reviewActivity(authenticatedUserId(response), request.params.activityId, input);
    response.status(result.created ? 201 : 200).json({ review: result.review, activity: result.activity });
  });

  router.get('/:activityId/reviews', async (request, response) => {
    response.json({ reviews: await activityService.listReviews(request.params.activityId) });
  });

  return router;
}
