import { Router } from 'express';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import { LIVE_EVENT_AREAS } from '../sync/liveEvents';
import type { NotificationService } from './notificationService';

const readBody = z.object({ area: z.enum(LIVE_EVENT_AREAS).optional() });

/**
 * GET  /api/notifications
 * POST /api/notifications/read
 */
export function createNotificationRouter(authService: AuthService, notificationService: NotificationService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.get('/', async (_request, response) => {
    response.json(await notificationService.list(authenticatedUserId(response)));
  });

  router.post('/read', async (request, response) => {
    const { area } = readBody.parse(request.body ?? {});
    response.json(await notificationService.markRead(authenticatedUserId(response), area));
  });

  return router;
}
