import request from 'supertest';

import { TripModel } from '../../src/trips/tripModel';
import type { TripDto } from '../../src/trips/tripService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville } from '../helpers/testville';

// A one-day trip in the small Testville catalogue, so generating it is quick
const TRIP = { city: 'Testville', startDate: '2026-10-24', endDate: '2026-10-24', dayStart: '09:00', dayEnd: '18:00' };

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface DELETE /api/trips/:tripId
describe('Mocked: DELETE /api/trips/:tripId', () => {
  // Mocked behavior: the trip database delete fails
  // Input: the id of the traveller's own trip
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Trip database delete fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);
    const trip = (await request(app).post('/api/trips/generate').set(authorization).send(TRIP)).body as TripDto;
    jest.spyOn(TripModel, 'deleteOne').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).delete(`/api/trips/${trip.id}`).set(authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
