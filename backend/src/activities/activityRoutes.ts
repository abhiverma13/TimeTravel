import { Router } from 'express';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { requireSession } from '../middleware/authenticate';
import type { ActivityService } from './activityService';
import { INTEREST_TAGS } from './interests';

const listActivitiesQuery = z.object({
  city: z.string().trim().min(1, 'city is required').max(80),
  interest: z.enum(INTEREST_TAGS).optional(),
});

/** GET /api/activities?city=<city>[&interest=<tag>] */
export function createActivityRouter(authService: AuthService, activityService: ActivityService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.get('/', async (request, response) => {
    const { city, interest } = listActivitiesQuery.parse(request.query);
    response.json({ city, activities: await activityService.listActivities(city, interest) });
  });

  return router;
}
