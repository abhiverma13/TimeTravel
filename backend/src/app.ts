import express, { type Express } from 'express';

import { createAuthRouter, createUserRouter } from './auth/authRoutes';
import type { AuthService } from './auth/authService';
import { isDatabaseConnected } from './db/connection';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export interface AppDependencies {
  authService: AuthService;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', database: isDatabaseConnected() ? 'connected' : 'disconnected' });
  });

  app.use('/api/auth', createAuthRouter(dependencies.authService));
  app.use('/api/users', createUserRouter(dependencies.authService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
