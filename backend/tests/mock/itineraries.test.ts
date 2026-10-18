import request from 'supertest';

import type { PlaceResult, PlacesClient } from '../../src/activities/placesClient';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

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
