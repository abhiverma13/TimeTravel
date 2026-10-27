import { ItineraryModel } from '../../src/itineraries/itineraryModel';
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
