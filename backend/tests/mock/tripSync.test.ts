import { Types } from 'mongoose';

import { ActivityModel } from '../../src/activities/activityModel';
import { UserModel } from '../../src/auth/userModel';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import { storeTestvilleTrip, seedTestville } from '../helpers/testville';
import { connectClient, startLiveServer, subscribeTo } from '../helpers/liveServer';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface Socket.io: subscribe { itineraryId } and itineraryUpdated { itinerary, actorId, summary }
describe('Mocked: Socket.io itinerary updates', () => {
  // Mocked behavior: reading the itinerary to check access fails
  // Input: subscribe to an itinerary id
  // Expected status code: none; the subscription is acknowledged with { ok: false }
  // Expected behavior: the error is logged and the device is not subscribed; the server keeps running
  // Expected output: { ok: false, error: "Internal server error" }
  test('Itinerary database read fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const testApp = createTestApp();
    const { authorization } = await signedInUser(testApp.authService);
    const live = await startLiveServer(testApp);
    const socket = await connectClient(live.url, authorization);
    jest.spyOn(ItineraryModel, 'findOne').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const reply = await subscribeTo(socket, '64b7f0c2a1b2c3d4e5f60718');

    expect(reply).toEqual({ ok: false, error: 'Internal server error' });
    expect(consoleError).toHaveBeenCalledWith('Live update subscription failed', expect.any(Error));
    socket.disconnect();
    await live.close();
  });
});

// Interface Socket.io: shareLocation { itineraryId, lat, lng }, stopSharingLocation { itineraryId }, and
// memberLocation / memberLocationStopped
describe('Mocked: Socket.io location sharing', () => {
  // Mocked behavior: looking up the sharer's name fails
  // Input: a subscribed traveller shares their location
  // Expected status code: none; the share is acknowledged with { ok: false }
  // Expected behavior: the error is logged and nothing is sent; the server keeps running
  // Expected output: { ok: false, error: "Internal server error" }
  test('User database read fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const testApp = createTestApp();
    const { userId, authorization } = await signedInUser(testApp.authService);
    await seedTestville(testApp.activityService);
    const itineraryId = await storeTestvilleTrip(userId, ['Harbour Park']);
    const live = await startLiveServer(testApp);
    const socket = await connectClient(live.url, authorization);
    await subscribeTo(socket, itineraryId);
    jest.spyOn(UserModel, 'findById').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const reply = await socket.emitWithAck('shareLocation', { itineraryId, lat: 49.28, lng: -123.12 });

    expect(reply).toEqual({ ok: false, error: 'Internal server error' });
    expect(consoleError).toHaveBeenCalledWith('Location sharing failed', expect.any(Error));
    socket.disconnect();
    await live.close();
  });
});

// Interface Socket.io: suggestionAdded { suggestion }
describe('Mocked: Socket.io suggestions', () => {
  // Mocked behavior: pushing the suggestion to devices fails
  // Input: a suggestion for Harbour Park in the rain
  // Expected status code: none
  // Expected behavior: the suggestion is still saved (members see it when they open the trip) and the failure is logged
  // Expected output: suggest returns true; "Failed to push a suggestion" is logged
  test('Pushing a suggestion fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const testApp = createTestApp({ now: () => new Date('2026-10-24T08:00:00Z') });
    const { userId } = await signedInUser(testApp.authService);
    await seedTestville(testApp.activityService);
    const itineraryId = await storeTestvilleTrip(userId, ['Morning Bakery', 'Harbour Park']);
    testApp.disruptionService.onSuggestion(() => {
      throw new Error('Simulated socket failure');
    });
    const parkId = (await ActivityModel.findOne({ name: 'Harbour Park' }))?._id.toString() ?? '';

    const made = await testApp.disruptionService.suggest(new Types.ObjectId(itineraryId), 0, parkId, 'rain');

    expect(made).toBe(true);
    expect(consoleError).toHaveBeenCalledWith('Failed to push a suggestion', expect.any(Error));
  });
});
