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
import { CHECK_INTERVAL_MS, DisruptionService } from './disruptions/disruptionService';
import { OpenWeatherClient } from './disruptions/weatherClient';
import { FriendService } from './friends/friendService';
import { GroupService } from './groups/groupService';
import { NearbyService } from './nearby/nearbyService';
import { PostService } from './posts/postService';
import { TripService } from './trips/tripService';
import { GoogleRoutesClient } from './trips/routesClient';
import { TravelTimeService } from './trips/travelTimes';
import { LiveEvents } from './sync/liveEvents';
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
  const liveEvents = new LiveEvents();
  const groupService = new GroupService(liveEvents);
  // The same Google Cloud key serves Places and Routes (Routes API must be enabled for it).
  const routesClient = env.googlePlacesApiKey ? new GoogleRoutesClient(env.googlePlacesApiKey) : null;
  const tripService = new TripService(activityService, placesClient, groupService, new TravelTimeService(routesClient));
  const friendService = new FriendService(liveEvents);
  const postService = new PostService(tripService, friendService, liveEvents);
  const nearbyService = new NearbyService(groupService, liveEvents);
  if (!env.openWeatherApiKey) {
    console.warn('OPENWEATHER_API_KEY is not set: trips under way are checked for closed venues only');
  }
  const weatherClient = env.openWeatherApiKey ? new OpenWeatherClient(env.openWeatherApiKey) : null;
  const disruptionService = new DisruptionService(tripService, weatherClient, placesClient, liveEvents);
  const app = createApp({ authService, activityService, groupService, tripService, friendService, postService, nearbyService, disruptionService });
  const hasTlsConfiguration = Boolean(env.tlsCertPath && env.tlsKeyPath);
  const server = hasTlsConfiguration
    ? createHttpsServer({ cert: readFileSync(env.tlsCertPath), key: readFileSync(env.tlsKeyPath) }, app)
    : createHttpServer(app);
  // Live trip updates share the API's port (and its TLS), so the app needs no second address.
  attachTripSync(server, { authService, tripService, groupService, disruptionService, liveEvents });
  // Checks trips under way for rain and closed venues; suggestions reach the members live.
  const disruptionTimer = setInterval(() => {
    disruptionService.checkActiveTrips().catch((error: unknown) => {
      console.error('Disruption check failed', error);
    });
  }, CHECK_INTERVAL_MS);

  server.listen(env.port, () => {
    console.info(`Server listening on ${hasTlsConfiguration ? 'HTTPS' : 'HTTP'} port ${String(env.port)}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      clearInterval(disruptionTimer);
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
