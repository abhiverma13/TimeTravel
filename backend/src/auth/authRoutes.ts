import { Router } from 'express';
import { z } from 'zod';

import { authenticatedUserId, requireSession } from '../middleware/authenticate';
import { INTEREST_TAGS } from '../shared/interestTags';
import type { AuthService } from './authService';

const googleSignInSchema = z.object({ idToken: z.string().trim().min(1, 'idToken is required') });

const profileUpdateSchema = z
  .object({
    homeCity: z.string().trim().max(80).optional(),
    interests: z.array(z.enum(INTEREST_TAGS)).max(INTEREST_TAGS.length).optional(),
  })
  .refine((update) => update.homeCity !== undefined || update.interests !== undefined, {
    message: 'Provide homeCity and/or interests',
  });

/** POST /api/auth/google */
export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post('/google', async (request, response) => {
    const { idToken } = googleSignInSchema.parse(request.body);
    response.json(await authService.signInWithGoogle(idToken));
  });

  return router;
}

/**
 * GET /api/users/me
 * PUT /api/users/me
 */
export function createUserRouter(authService: AuthService): Router {
  const router = Router();
  router.use(requireSession(authService));

  router.get('/me', async (_request, response) => {
    response.json(await authService.getProfile(authenticatedUserId(response)));
  });

  router.put('/me', async (request, response) => {
    const update = profileUpdateSchema.parse(request.body);
    response.json(await authService.updateProfile(authenticatedUserId(response), update));
  });

  return router;
}
