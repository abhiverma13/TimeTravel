import request from 'supertest';

import type { PlaceResult, PlacesClient } from '../../src/activities/placesClient';
import type { GeoPoint, TransportMode } from '../../src/itineraries/engine/types';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import { GoogleRoutesClient, type RoutesClient } from '../../src/itineraries/routesClient';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville } from '../helpers/testville';

const TRIP = { city: 'Vancouver', startDate: '2026-10-24', endDate: '2026-10-25', interests: ['outdoors'], pace: 'moderate' };

const fairmont: PlaceResult = {
  placeId: 'place-fairmont',
  name: 'Fairmont Hotel Vancouver',
  address: '900 W Georgia St, Vancouver, BC',
  location: { lat: 49.2838, lng: -123.1205 },
  types: ['lodging'],
  rating: 4.5,
  userRatingCount: 5000,
  openingPeriods: undefined,
};

function lodgingClient(search: () => Promise<PlaceResult[]>): PlacesClient & { searchText: jest.Mock } {
  return { searchText: jest.fn(search) };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /api/itineraries/generate
describe('Mocked: POST /api/itineraries/generate', () => {
  // Mocked behavior: Google Places finds the traveller's hotel
  // Input: the Vancouver trip with lodging "Fairmont Hotel Vancouver" (catalogue already cached)
  // Expected status code: 201
  // Expected behavior: Places is searched for the hotel in the trip's city and days start there
  // Expected output: lodging { label: "Fairmont Hotel Vancouver", source: "places" } and no warnings
  test('Lodging found with Google Places', async () => {
    const placesClient = lodgingClient(async () => Promise.resolve([fairmont]));
    const { app, authService, activityService } = createTestApp({ placesClient });
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app)
      .post('/api/itineraries/generate')
      .set(authorization)
      .send({ ...TRIP, lodging: 'Fairmont Hotel Vancouver' });

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(placesClient.searchText).toHaveBeenCalledWith('Fairmont Hotel Vancouver, Vancouver');
    expect(itinerary.lodging).toEqual({ label: 'Fairmont Hotel Vancouver', lat: 49.2838, lng: -123.1205, source: 'places' });
    expect(itinerary.warnings).toEqual([]);
  });

  // Mocked behavior: Google Places finds nothing for the lodging text
  // Input: the Vancouver trip with lodging "Nowhere Inn"
  // Expected status code: 201
  // Expected behavior: days start at the city centre and the traveller is told
  // Expected output: lodging.source "city-centre" and a warning
  test('Lodging not found', async () => {
    const { app, authService, activityService } = createTestApp({ placesClient: lodgingClient(async () => Promise.resolve([])) });
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send({ ...TRIP, lodging: 'Nowhere Inn' });

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(itinerary.lodging.source).toBe('city-centre');
    expect(itinerary.warnings).toHaveLength(1);
  });

  // Mocked behavior: the Google Places lodging search fails
  // Input: the Vancouver trip with lodging "Fairmont Hotel Vancouver"
  // Expected status code: 201
  // Expected behavior: generation still succeeds from the city centre, with a warning
  // Expected output: lodging.source "city-centre" and a warning
  test('Lodging lookup fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const placesClient = lodgingClient(async () => Promise.reject(new Error('Places unavailable')));
    const { app, authService, activityService } = createTestApp({ placesClient });
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app)
      .post('/api/itineraries/generate')
      .set(authorization)
      .send({ ...TRIP, lodging: 'Fairmont Hotel Vancouver' });

    expect(response.status).toBe(201);
    expect((response.body as ItineraryDto).lodging.source).toBe('city-centre');
  });

  // Mocked behavior: the activity catalogue for the city is empty
  // Input: a trip to a city Google Places knows nothing about
  // Expected status code: 404
  // Expected behavior: nothing is generated
  // Expected output: { error: "No activities found for Nowhere" }
  test('City with no activities', async () => {
    const { app, authService } = createTestApp({ placesClient: lodgingClient(async () => Promise.resolve([])) });
    const { authorization } = await signedInUser(authService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send({ ...TRIP, city: 'Nowhere' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'No activities found for Nowhere' });
  });

  // Mocked behavior: saving the itinerary to the database fails
  // Input: the Vancouver trip
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Itinerary database write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    jest.spyOn(ItineraryModel, 'create').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send(TRIP);

    expect(response.status).toBe(500);
  });
});

// Interface GET /api/itineraries/:itineraryId
describe('Mocked: GET /api/itineraries/:itineraryId', () => {
  // Mocked behavior: the itinerary database read fails
  // Input: a valid itinerary id
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Itinerary database read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(ItineraryModel, 'findOne').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).get('/api/itineraries/64b7f0c2a1b2c3d4e5f60718').set(authorization);

    expect(response.status).toBe(500);
  });
});

// Interface GET /api/itineraries
describe('Mocked: GET /api/itineraries', () => {
  // Mocked behavior: the itinerary database query fails
  // Input: a signed-in traveller
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Itinerary database query fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(ItineraryModel, 'find').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).get('/api/itineraries').set(authorization);

    expect(response.status).toBe(500);
  });
});

const TESTVILLE_DAY = { city: 'Testville', startDate: '2026-10-24', endDate: '2026-10-24', dayStart: '09:00', dayEnd: '18:00' };

/** A fake Google Routes that says every trip takes `minutes`, and records each request's size. */
function routesTaking(minutes: number) {
  const requests: { origins: number; destinations: number; mode: TransportMode }[] = [];
  const client: RoutesClient & { computeMatrix: jest.Mock } = {
    computeMatrix: jest.fn(async (origins: readonly GeoPoint[], destinations: readonly GeoPoint[], mode: TransportMode) => {
      requests.push({ origins: origins.length, destinations: destinations.length, mode });
      return Promise.resolve(
        origins.flatMap((_, originIndex) => destinations.map((__, destinationIndex) => ({ originIndex, destinationIndex, minutes }))),
      );
    }),
  };
  return { client, requests };
}

function allStops(itinerary: ItineraryDto): ItineraryDto['days'][number]['stops'] {
  return itinerary.days.flatMap((day) => day.stops);
}

// Interface POST /api/itineraries/generate, with Google Routes travel times
describe('Mocked: POST /api/itineraries/generate with Google Routes', () => {
  // Mocked behavior: Google Routes says every trip between Testville's places takes 7 minutes
  // Input: a one-day Testville trip
  // Expected status code: 201
  // Expected behavior: the plan uses Routes' times instead of the estimate, from one request for 5 points
  //                    (the lodging and the 4 places open during the day; Night Market opens too late)
  // Expected output: every stop and the trip back take 7 minutes; travelTimeSource "google-routes"
  test('Travel times come from Google Routes', async () => {
    const { client, requests } = routesTaking(7);
    const { app, authService, activityService } = createTestApp({ routesClient: client });
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send(TESTVILLE_DAY);

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(itinerary.travelTimeSource).toBe('google-routes');
    expect(allStops(itinerary).every((stop) => stop.travelMinutes === 7)).toBe(true);
    expect(itinerary.days.at(0)?.returnTravelMinutes).toBe(7);
    expect(requests).toEqual([{ origins: 5, destinations: 5, mode: 'transit' }]);
  });

  // Mocked behavior: Google Routes answers every request
  // Input: the same Testville trip generated twice, then one of its stops locked
  // Expected status code: 201, 201, 200
  // Expected behavior: Routes times are cached for a week, and adjustments never call Routes
  // Expected output: a single Routes request in total
  test('Routes times are cached and adjustments reuse them', async () => {
    const { client } = routesTaking(7);
    const { app, authService, activityService } = createTestApp({ routesClient: client });
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);

    await request(app).post('/api/itineraries/generate').set(authorization).send(TESTVILLE_DAY);
    const second = (await request(app).post('/api/itineraries/generate').set(authorization).send(TESTVILLE_DAY)).body as ItineraryDto;
    const adjusted = await request(app)
      .post(`/api/itineraries/${second.id}/adjust`)
      .set(authorization)
      .send({ action: 'lock', version: 0, dayIndex: 0, activityId: allStops(second).at(0)?.activityId });

    expect(adjusted.status).toBe(200);
    expect(second.travelTimeSource).toBe('google-routes');
    expect(client.computeMatrix).toHaveBeenCalledTimes(1);
  });

  // Mocked behavior: Google Routes answers every request
  // Input: a Vancouver transit trip, so the lodging and the 12 best candidates need 169 travel times
  // Expected status code: 201
  // Expected behavior: the matrix is requested in pieces of at most 100 pairs, Google's limit for transit
  // Expected output: two or more requests, none larger than 100 pairs, covering all 13 origins
  test('Transit matrices stay within the per-request limit', async () => {
    const { client, requests } = routesTaking(9);
    const { app, authService, activityService } = createTestApp({ routesClient: client });
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send({ ...TRIP, transportMode: 'transit' });

    expect(response.status).toBe(201);
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(requests.every((size) => size.origins * size.destinations <= 100 && size.destinations === 13)).toBe(true);
    expect(requests.reduce((sum, size) => sum + size.origins, 0)).toBe(13);
  });

  // Mocked behavior: Google Routes fails
  // Input: a one-day Testville trip
  // Expected status code: 201
  // Expected behavior: the plan falls back to the offline estimate
  // Expected output: travelTimeSource "estimate"
  test('Routes fails', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client: RoutesClient = { computeMatrix: jest.fn(async () => Promise.reject(new Error('Routes unavailable'))) };
    const { app, authService, activityService } = createTestApp({ routesClient: client });
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send(TESTVILLE_DAY);

    expect(response.status).toBe(201);
    expect((response.body as ItineraryDto).travelTimeSource).toBe('estimate');
    expect(consoleWarn).toHaveBeenCalledWith('Google Routes travel times unavailable; using estimates', expect.any(Error));
  });
});

// Interface POST /api/itineraries/generate, through the production Google Routes client
describe('Mocked: POST /api/itineraries/generate via GoogleRoutesClient', () => {
  // Mocked behavior: Google's Compute Route Matrix answers one pair (300 s), reports another as unroutable, and
  //                  leaves out zero indexes as its JSON encoding does
  // Input: a one-day walking trip in Testville
  // Expected status code: 201
  // Expected behavior: the client sends the API key, field mask and WALK mode, and reads the times it gets back
  // Expected output: travelTimeSource "google-routes"; one request to the Routes API
  test('Parses a Compute Route Matrix response', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { destinationIndex: 1, duration: '300s', condition: 'ROUTE_EXISTS' },
          { originIndex: 1, destinationIndex: 0, condition: 'ROUTE_NOT_FOUND' },
        ]),
        { status: 200 },
      ),
    );
    const { app, authService, activityService } = createTestApp({ routesClient: new GoogleRoutesClient('test-key') });
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send({ ...TESTVILLE_DAY, transportMode: 'walk' });

    expect(response.status).toBe(201);
    expect((response.body as ItineraryDto).travelTimeSource).toBe('google-routes');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix');
    expect(init?.headers).toMatchObject({ 'X-Goog-Api-Key': 'test-key', 'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,condition' });
    expect(JSON.parse(String(init?.body))).toMatchObject({ travelMode: 'WALK' });
  });

  // Mocked behavior: the Routes API rejects the request (HTTP 403), then returns a body that is not a matrix
  // Input: a one-day Testville trip, generated once for each response
  // Expected status code: 201 for both
  // Expected behavior: both failures fall back to the offline estimate
  // Expected output: travelTimeSource "estimate" both times
  test.each([
    ['Routes rejects the request', 403, '{"error":{"code":403}}'],
    ['Routes returns an unexpected body', 200, '{"matrix":"no"}'],
  ])('%s', async (_scenario, status, body) => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(body, { status }));
    const { app, authService, activityService } = createTestApp({ routesClient: new GoogleRoutesClient('test-key') });
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send(TESTVILLE_DAY);

    expect(response.status).toBe(201);
    expect((response.body as ItineraryDto).travelTimeSource).toBe('estimate');
  });
});
