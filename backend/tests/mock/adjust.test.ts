import request from 'supertest';

import { TripModel } from '../../src/trips/tripModel';
import type { TripDto } from '../../src/trips/tripService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

async function lockParkRequest() {
  const testApp = createTestApp();
  const owner = await signedInUser(testApp.authService);
  await seedTestville(testApp.activityService);
  const tripId = await storeTestvilleTrip(owner.userId, ['Morning Bakery', 'Harbour Park']);
  const trip = (await request(testApp.app).get(`/api/trips/${tripId}`).set(owner.authorization)).body as TripDto;
  const parkId = trip.days.at(0)?.stops.at(1)?.activityId;
  const send = () =>
    request(testApp.app)
      .post(`/api/trips/${tripId}/adjust`)
      .set(owner.authorization)
      .send({ action: 'lock', version: 0, dayIndex: 0, activityId: parkId });
  return { ...testApp, send };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /api/trips/:tripId/adjust
describe('Mocked: POST /api/trips/:tripId/adjust', () => {
  // Mocked behavior: another member's change is saved between this request's read and its write
  // Input: lock a stop with the version that was current when the request started
  // Expected status code: 409
  // Expected behavior: the conditional write matches nothing, so the other change is not overwritten
  // Expected output: { error: "This trip changed since you loaded it; reload it and try again" }
  test('A concurrent change lands first', async () => {
    const { send } = await lockParkRequest();
    jest.spyOn(TripModel, 'findOneAndUpdate').mockResolvedValue(null);

    const response = await send();

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'This trip changed since you loaded it; reload it and try again' });
  });

  // Mocked behavior: saving the adjusted trip fails
  // Input: lock a stop
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server, and no update is pushed
  // Expected output: { error: "Internal server error" }
  test('Trip database write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { send, tripService } = await lockParkRequest();
    const listener = jest.fn();
    tripService.onTripChanged(listener);
    jest.spyOn(TripModel, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await send();

    expect(response.status).toBe(500);
    expect(listener).not.toHaveBeenCalled();
  });

  // Mocked behavior: reading the city's activity catalogue fails
  // Input: lock a stop
  // Expected status code: 500
  // Expected behavior: nothing is saved
  // Expected output: { error: "Internal server error" }
  test('Activity catalogue read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { send, activityService } = await lockParkRequest();
    jest.spyOn(activityService, 'listActivities').mockRejectedValue(new Error('Simulated database outage'));

    const response = await send();

    expect(response.status).toBe(500);
  });

  // Mocked behavior: pushing the change to connected devices fails
  // Input: lock a stop
  // Expected status code: 200
  // Expected behavior: the change is saved anyway; devices catch up when they reload
  // Expected output: the trip at version 1
  test('Live update push fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { send, tripService } = await lockParkRequest();
    tripService.onTripChanged(() => {
      throw new Error('Simulated push failure');
    });

    const response = await send();

    expect(response.status).toBe(200);
    expect((response.body as TripDto).version).toBe(1);
    expect(consoleError).toHaveBeenCalledWith('Failed to push a trip change', expect.any(Error));
  });
});
