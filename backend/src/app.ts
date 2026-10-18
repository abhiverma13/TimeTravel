import express, { type Express } from 'express';

import { isDatabaseConnected } from './db/connection';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', database: isDatabaseConnected() ? 'connected' : 'disconnected' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
