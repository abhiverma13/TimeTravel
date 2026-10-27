import express, { type Express } from 'express';

import { createActivityRouter } from './activities/activityRoutes';
import type { ActivityService } from './activities/activityService';
import { createAuthRouter, createUserRouter } from './auth/authRoutes';
import type { AuthService } from './auth/authService';
import { isDatabaseConnected } from './db/connection';
import { createSuggestionRouter } from './disruptions/disruptionRoutes';
import type { DisruptionService } from './disruptions/disruptionService';
import { createFriendRouter, createTravellerRouter } from './friends/friendRoutes';
import type { FriendService } from './friends/friendService';
import { createGroupRouter } from './groups/groupRoutes';
import type { GroupService } from './groups/groupService';
import { createItineraryRouter } from './itineraries/itineraryRoutes';
import type { ItineraryService } from './itineraries/itineraryService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createNearbyRouter } from './nearby/nearbyRoutes';
import type { NearbyService } from './nearby/nearbyService';
import { createPostRouter } from './posts/postRoutes';
import type { PostService } from './posts/postService';

export interface AppDependencies {
  authService: AuthService;
  activityService: ActivityService;
  groupService: GroupService;
  itineraryService: ItineraryService;
  friendService: FriendService;
  postService: PostService;
  nearbyService: NearbyService;
  disruptionService: DisruptionService;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', database: isDatabaseConnected() ? 'connected' : 'disconnected' });
  });

  app.use('/api/auth', createAuthRouter(dependencies.authService));
  app.use('/api/users', createUserRouter(dependencies.authService));
  app.use('/api/activities', createActivityRouter(dependencies.authService, dependencies.activityService));
  app.use('/api/groups', createGroupRouter(dependencies.authService, dependencies.groupService));
  app.use('/api/itineraries', createItineraryRouter(dependencies.authService, dependencies.itineraryService));
  app.use('/api/travellers', createTravellerRouter(dependencies.authService, dependencies.friendService));
  app.use('/api/friends', createFriendRouter(dependencies.authService, dependencies.friendService));
  app.use('/api/posts', createPostRouter(dependencies.authService, dependencies.postService));
  app.use('/api/nearby', createNearbyRouter(dependencies.authService, dependencies.nearbyService));
  app.use('/api/suggestions', createSuggestionRouter(dependencies.authService, dependencies.disruptionService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
