import type { Express } from 'express';

import { ActivityService } from '../../src/activities/activityService';
import type { PlacesClient } from '../../src/activities/placesClient';
import { createApp } from '../../src/app';
import { AuthService } from '../../src/auth/authService';
import { createGoogleTokenVerifier, type GoogleTokenVerifier } from '../../src/auth/googleTokenVerifier';
import { UserModel } from '../../src/auth/userModel';
import { DEMO_VANCOUVER_PLACES } from '../../src/dev/demoVancouverPlaces';
import { ItineraryService } from '../../src/itineraries/itineraryService';

export const TEST_JWT_SECRET = 'test-jwt-secret';
export const TEST_GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

export interface TestAppOptions {
  /** Replaces real Google token verification; defaults to the real verifier. */
  verifyGoogleToken?: GoogleTokenVerifier;
  /** Google Places client; defaults to none, as on a server without GOOGLE_PLACES_API_KEY. */
  placesClient?: PlacesClient;
  /** Clock used for catalogue cache expiry. */
  now?: () => Date;
}

export interface TestApp {
  app: Express;
  authService: AuthService;
  activityService: ActivityService;
  itineraryService: ItineraryService;
}

export function createTestApp(options: TestAppOptions = {}): TestApp {
  const authService = new AuthService(
    options.verifyGoogleToken ?? createGoogleTokenVerifier(TEST_GOOGLE_CLIENT_ID),
    TEST_JWT_SECRET,
  );
  const placesClient = options.placesClient ?? null;
  const activityService = new ActivityService(placesClient, options.now);
  const itineraryService = new ItineraryService(activityService, placesClient);
  return {
    app: createApp({ authService, activityService, itineraryService }),
    authService,
    activityService,
    itineraryService,
  };
}

/** Creates a user directly in the database and returns an Authorization header for them. */
export async function signedInUser(
  authService: AuthService,
  name = 'Test Traveller',
): Promise<{ userId: string; authorization: { Authorization: string } }> {
  const user = await UserModel.create({
    googleId: `google-${name.replace(/\s+/g, '-').toLowerCase()}`,
    email: `${name.replace(/\s+/g, '.').toLowerCase()}@example.com`,
    name,
  });
  const userId = user._id.toString();
  return { userId, authorization: { Authorization: `Bearer ${authService.createSessionToken(userId)}` } };
}

/** Pre-populates the Vancouver catalogue so no Google Places call is needed. */
export async function seedVancouver(activityService: ActivityService): Promise<void> {
  await activityService.importPlaces('Vancouver', DEMO_VANCOUVER_PLACES);
}
