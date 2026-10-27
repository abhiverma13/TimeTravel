import request from 'supertest';

import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

async function lockParkRequest() {
  const testApp = createTestApp();
  const owner = await signedInUser(testApp.authService);
  await seedTestville(testApp.activityService);
  const itineraryId = await storeTestvilleTrip(owner.userId, ['Morning Bakery', 'Harbour Park']);
  const itinerary = (await request(testApp.app).get(`/api/itineraries/${itineraryId}`).set(owner.authorization)).body as ItineraryDto;
  const parkId = itinerary.days.at(0)?.stops.at(1)?.activityId;
  const send = () =>
    request(testApp.app)
      .post(`/api/itineraries/${itineraryId}/adjust`)
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

// Interface POST /api/itineraries/:itineraryId/adjust
describe('Mocked: POST /api/itineraries/:itineraryId/adjust', () => {
  // Mocked behavior: another member's change is saved between this request's read and its write
  // Input: lock a stop with the version that was current when the request started
  // Expected status code: 409
  // Expected behavior: the conditional write matches nothing, so the other change is not overwritten
  // Expected output: { error: "This itinerary changed since you loaded it; reload it and try again" }
  test('A concurrent change lands first', async () => {
    const { send } = await lockParkRequest();
    jest.spyOn(ItineraryModel, 'findOneAndUpdate').mockResolvedValue(null);

    const response = await send();

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'This itinerary changed since you loaded it; reload it and try again' });
  });

  // Mocked behavior: saving the adjusted itinerary fails
  // Input: lock a stop
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server, and no update is pushed
  // Expected output: { error: "Internal server error" }
  test('Itinerary database write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { send, itineraryService } = await lockParkRequest();
    const listener = jest.fn();
    itineraryService.onItineraryChanged(listener);
    jest.spyOn(ItineraryModel, 'findOneAndUpdate').mockImplementation(() => {
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
  // Expected output: the itinerary at version 1
  test('Live update push fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { send, itineraryService } = await lockParkRequest();
    itineraryService.onItineraryChanged(() => {
      throw new Error('Simulated push failure');
    });

    const response = await send();

    expect(response.status).toBe(200);
    expect((response.body as ItineraryDto).version).toBe(1);
    expect(consoleError).toHaveBeenCalledWith('Failed to push an itinerary change', expect.any(Error));
  });
});
