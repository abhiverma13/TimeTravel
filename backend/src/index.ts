import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

import { ActivityService } from './activities/activityService';
import { GooglePlacesClient } from './activities/placesClient';
import { createApp } from './app';
import { AuthService } from './auth/authService';
import { createGoogleTokenVerifier } from './auth/googleTokenVerifier';
import { env } from './config/env';
import { connectToDatabase, disconnectFromDatabase } from './db/connection';
import { GroupService } from './groups/groupService';
import { ItineraryService } from './itineraries/itineraryService';
import { GoogleRoutesClient } from './itineraries/routesClient';
import { TravelTimeService } from './itineraries/travelTimes';
import { attachTripSync } from './sync/tripSync';

async function main(): Promise<void> {
  if (!env.jwtSecret) {
    throw new Error('JWT_SECRET must be set in backend/.env');
  }
  await connectToDatabase(env.mongodbUri);

  const authService = new AuthService(createGoogleTokenVerifier(env.googleClientId), env.jwtSecret);
  if (!env.googlePlacesApiKey) {
    console.warn('GOOGLE_PLACES_API_KEY is not set: only cities already in the database can be browsed');
  }
  const placesClient = env.googlePlacesApiKey ? new GooglePlacesClient(env.googlePlacesApiKey) : null;
  const activityService = new ActivityService(placesClient);
  const groupService = new GroupService();
  // The same Google Cloud key serves Places and Routes (Routes API must be enabled for it).
  const routesClient = env.googlePlacesApiKey ? new GoogleRoutesClient(env.googlePlacesApiKey) : null;
  const itineraryService = new ItineraryService(activityService, placesClient, groupService, new TravelTimeService(routesClient));
  const app = createApp({ authService, activityService, groupService, itineraryService });
  const hasTlsConfiguration = Boolean(env.tlsCertPath && env.tlsKeyPath);
  const server = hasTlsConfiguration
    ? createHttpsServer({ cert: readFileSync(env.tlsCertPath), key: readFileSync(env.tlsKeyPath) }, app)
    : createHttpServer(app);
  // Live itinerary updates share the API's port (and its TLS), so the app needs no second address.
  attachTripSync(server, authService, itineraryService);

  server.listen(env.port, () => {
    console.info(`Server listening on ${hasTlsConfiguration ? 'HTTPS' : 'HTTP'} port ${String(env.port)}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      server.close(() => {
        disconnectFromDatabase().catch((error: unknown) => {
          console.error('Failed to close the database connection', error);
          process.exitCode = 1;
        });
      });
    });
  }
}

main().catch((error: unknown) => {
  console.error('Failed to start the TimeTravel backend', error);
  process.exitCode = 1;
});
