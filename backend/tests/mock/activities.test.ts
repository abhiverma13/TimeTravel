import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import { type ActivityDto, CATALOGUE_TTL_MS } from '../../src/activities/activityService';
import { GooglePlacesClient, type PlaceResult, type PlacesClient } from '../../src/activities/placesClient';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

interface ActivitiesBody {
  city: string;
  activities: ActivityDto[];
}

const harbourWalk: PlaceResult = {
  placeId: 'place-harbour-walk',
  name: 'Harbour Walk',
  address: '1 Harbour Rd, Victoria, BC',
  location: { lat: 48.4222, lng: -123.3657 },
  types: ['park'],
  rating: 4.6,
  userRatingCount: 1200,
  openingPeriods: undefined,
};

/** A Places client whose searchText is a Jest mock returning `places` for every query. */
function placesClientReturning(places: PlaceResult[]): PlacesClient & { searchText: jest.Mock } {
  return { searchText: jest.fn(async () => Promise.resolve(places)) };
}

function failingPlacesClient(): PlacesClient & { searchText: jest.Mock } {
  return { searchText: jest.fn(async () => Promise.reject(new Error('Places quota exceeded'))) };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface GET /api/activities
describe('Mocked: GET /api/activities', () => {
  // Mocked behavior: Google Places returns one park for every interest search
  // Input: city=Victoria, which is not cached yet; then the same request again
  // Expected status code: 200 both times
  // Expected behavior: one search per interest tag on the first request, stored in MongoDB; the second is served from cache
  // Expected output: { city: "Victoria", activities: [Harbour Walk] }
  test('Cache miss searches Places once per interest, then caches', async () => {
    const placesClient = placesClientReturning([harbourWalk]);
    const { app, authService } = createTestApp({ placesClient });
    const { authorization } = await signedInUser(authService);

    const first = await request(app).get('/api/activities').query({ city: 'Victoria' }).set(authorization);
    const second = await request(app).get('/api/activities').query({ city: 'Victoria' }).set(authorization);

    expect(first.status).toBe(200);
    expect(placesClient.searchText).toHaveBeenCalledTimes(7);
    expect(placesClient.searchText).toHaveBeenCalledWith('museums and galleries in Victoria');
    const body = second.body as ActivitiesBody;
    expect(second.status).toBe(200);
    expect(placesClient.searchText).toHaveBeenCalledTimes(7);
    expect(body.activities).toHaveLength(1);
    // Found by every interest search, so it carries every tag; its own "park" type adds nothing new.
    expect(body.activities[0]?.interests).toHaveLength(7);
    expect(body.activities[0]?.openingHours).toBeNull();
  });

  // Mocked behavior: Google Places returns a park; the clock is moved past the cache lifetime
  // Input: city=Vancouver, cached more than 7 days ago
  // Expected status code: 200
  // Expected behavior: the stale catalogue is refreshed from Places and merged with the stored activities
  // Expected output: the 30 cached activities plus the newly found one
  test('Stale cache is refreshed', async () => {
    const placesClient = placesClientReturning([harbourWalk]);
    let now = new Date('2026-10-01T12:00:00Z');
    const { app, authService, activityService } = createTestApp({ placesClient, now: () => now });
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    now = new Date(now.getTime() + CATALOGUE_TTL_MS + 1);

    const response = await request(app).get('/api/activities').query({ city: 'Vancouver' }).set(authorization);

    expect(response.status).toBe(200);
    expect(placesClient.searchText).toHaveBeenCalledTimes(7);
    expect((response.body as ActivitiesBody).activities).toHaveLength(31);
  });

  // Mocked behavior: Google Places fails (quota exceeded) and nothing is cached
  // Input: city=Victoria
  // Expected status code: 502
  // Expected behavior: the failure is reported; nothing is stored
  // Expected output: { error: "Could not load activities from Google Places" }
  test('Places fails with no cache', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp({ placesClient: failingPlacesClient() });
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/activities').query({ city: 'Victoria' }).set(authorization);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Could not load activities from Google Places' });
    expect(await ActivityModel.countDocuments()).toBe(0);
  });

  // Mocked behavior: Google Places fails while the cached catalogue is stale
  // Input: city=Vancouver, cached more than 7 days ago
  // Expected status code: 200
  // Expected behavior: the stale catalogue is served rather than failing the traveller
  // Expected output: the 30 cached Vancouver activities
  test('Places fails with a stale cache', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let now = new Date('2026-10-01T12:00:00Z');
    const { app, authService, activityService } = createTestApp({ placesClient: failingPlacesClient(), now: () => now });
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    now = new Date(now.getTime() + CATALOGUE_TTL_MS + 1);

    const response = await request(app).get('/api/activities').query({ city: 'Vancouver' }).set(authorization);

    expect(response.status).toBe(200);
    expect((response.body as ActivitiesBody).activities).toHaveLength(30);
  });

  // Mocked behavior: no Places client is configured; the cached catalogue is stale
  // Input: city=Vancouver, cached more than 7 days ago
  // Expected status code: 200
  // Expected behavior: the stale catalogue is served because it cannot be refreshed
  // Expected output: the 30 cached Vancouver activities
  test('Stale cache without Places configured', async () => {
    let now = new Date('2026-10-01T12:00:00Z');
    const { app, authService, activityService } = createTestApp({ now: () => now });
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    now = new Date(now.getTime() + CATALOGUE_TTL_MS + 1);

    const response = await request(app).get('/api/activities').query({ city: 'Vancouver' }).set(authorization);

    expect(response.status).toBe(200);
    expect((response.body as ActivitiesBody).activities).toHaveLength(30);
  });

  // Mocked behavior: Google Places finds nothing for the city
  // Input: city=Nowhere
  // Expected status code: 200
  // Expected behavior: an empty catalogue is cached so Places is not searched again for a week
  // Expected output: { city: "Nowhere", activities: [] }
  test('City with no activities', async () => {
    const placesClient = placesClientReturning([]);
    const { app, authService } = createTestApp({ placesClient });
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/activities').query({ city: 'Nowhere' }).set(authorization);
    await request(app).get('/api/activities').query({ city: 'Nowhere' }).set(authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ city: 'Nowhere', activities: [] });
    expect(placesClient.searchText).toHaveBeenCalledTimes(7);
  });

  // Mocked behavior: Google Places returns a place that has no Google rating yet
  // Input: city=Smallville
  // Expected status code: 200
  // Expected behavior: with no ratings in the city, the score falls back to the default city mean of 4
  // Expected output: one activity with googleRating null and communityScore 4
  test('Unrated place in an unrated city', async () => {
    const placesClient = placesClientReturning([{ ...harbourWalk, rating: null, userRatingCount: 0 }]);
    const { app, authService } = createTestApp({ placesClient });
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/activities').query({ city: 'Smallville' }).set(authorization);

    expect(response.status).toBe(200);
    expect((response.body as ActivitiesBody).activities[0]).toMatchObject({ googleRating: null, communityScore: 4 });
  });

  // Mocked behavior: the activity database read fails
  // Input: city=Vancouver, cached
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Database read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    jest.spyOn(ActivityModel, 'find').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).get('/api/activities').query({ city: 'Vancouver' }).set(authorization);

    expect(response.status).toBe(500);
  });
});

// Interface GET /api/activities, through the production Google Places client
describe('Mocked: GET /api/activities via GooglePlacesClient', () => {
  // Mocked behavior: fetch returns a Places (New) searchText response with one complete and one incomplete place
  // Input: city=Victoria
  // Expected status code: 200
  // Expected behavior: Places is called with the API key and field mask; the place without a location is skipped
  // Expected output: one activity named "Harbour Walk" with converted opening hours
  test('Parses a Places searchText response', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      Promise.resolve(
        jsonResponse({
          places: [
            {
              id: 'place-harbour-walk',
              displayName: { text: 'Harbour Walk', languageCode: 'en' },
              formattedAddress: '1 Harbour Rd, Victoria, BC',
              location: { latitude: 48.4222, longitude: -123.3657 },
              types: ['park', 'point_of_interest'],
              rating: 4.6,
              userRatingCount: 1200,
              regularOpeningHours: { periods: [{ open: { day: 1, hour: 8, minute: 30 }, close: { day: 1, hour: 20, minute: 0 } }] },
              priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
            },
            { id: 'place-without-location', displayName: { text: 'Somewhere' } },
          ],
        }),
      ),
    );
    const { app, authService } = createTestApp({ placesClient: new GooglePlacesClient('test-places-key') });
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/activities').query({ city: 'Victoria' }).set(authorization);

    expect(response.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(init?.headers).toMatchObject({ 'X-Goog-Api-Key': 'test-places-key' });
    const activities = (response.body as ActivitiesBody).activities;
    expect(activities.map((activity) => activity.name)).toEqual(['Harbour Walk']);
    expect(activities[0]?.openingHours).toEqual([{ day: 1, openMinute: 510, closeMinute: 1200 }]);
    expect(activities[0]?.cost).toBe('low');
  });

  // Mocked behavior: fetch returns an empty Places response ({} means no results)
  // Input: city=Nowhere
  // Expected status code: 200
  // Expected behavior: an empty catalogue is cached
  // Expected output: { city: "Nowhere", activities: [] }
  test('Empty Places response', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => Promise.resolve(jsonResponse({})));
    const { app, authService } = createTestApp({ placesClient: new GooglePlacesClient('test-places-key') });
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/activities').query({ city: 'Nowhere' }).set(authorization);

    expect(response.status).toBe(200);
    expect((response.body as ActivitiesBody).activities).toEqual([]);
  });

  // Mocked behavior: fetch returns HTTP 403 (invalid or restricted API key)
  // Input: city=Victoria
  // Expected status code: 502
  // Expected behavior: the Places error is reported as an upstream failure
  // Expected output: { error: "Could not load activities from Google Places" }
  test('Places rejects the API key', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockImplementation(async () => Promise.resolve(jsonResponse({ error: { code: 403 } }, 403)));
    const { app, authService } = createTestApp({ placesClient: new GooglePlacesClient('bad-key') });
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/activities').query({ city: 'Victoria' }).set(authorization);

    expect(response.status).toBe(502);
  });

  // Mocked behavior: fetch returns a 200 response whose body does not match the Places schema
  // Input: city=Victoria
  // Expected status code: 502
  // Expected behavior: the malformed response is rejected rather than stored
  // Expected output: { error: "Could not load activities from Google Places" }
  test('Places returns an unexpected body', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockImplementation(async () => Promise.resolve(jsonResponse({ places: 'not-a-list' })));
    const { app, authService } = createTestApp({ placesClient: new GooglePlacesClient('test-places-key') });
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/activities').query({ city: 'Victoria' }).set(authorization);

    expect(response.status).toBe(502);
    expect(await ActivityModel.countDocuments()).toBe(0);
  });
});
