import express, { type Express } from 'express';

import { createActivityRouter } from './activities/activityRoutes';
import type { ActivityService } from './activities/activityService';
import { createAuthRouter, createUserRouter } from './auth/authRoutes';
import type { AuthService } from './auth/authService';
import { isDatabaseConnected } from './db/connection';
import { createItineraryRouter } from './itineraries/itineraryRoutes';
import type { ItineraryService } from './itineraries/itineraryService';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export interface AppDependencies {
  authService: AuthService;
  activityService: ActivityService;
  itineraryService: ItineraryService;
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
  app.use('/api/itineraries', createItineraryRouter(dependencies.authService, dependencies.itineraryService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
