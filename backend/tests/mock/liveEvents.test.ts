import request from 'supertest';

import { UserModel } from '../../src/auth/userModel';
import type { LiveEvent } from '../../src/sync/liveEvents';
import { connectClient, startLiveServer } from '../helpers/liveServer';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface Socket.io: liveEvent { type, text, actorId, groupId?, tripId?, postId?, at }, after POST /api/friends/requests
describe('Mocked: Socket.io live events', () => {
  // Mocked behavior: pushing the live event to devices fails
  // Input: Ava asks Ben to be friends
  // Expected status code: 201
  // Expected behavior: the request is still sent, and the failure is logged
  // Expected output: Ben as a traveller with friendship "requested"; "Failed to push a live event" is logged
  test('Pushing a live event fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const testApp = createTestApp();
    const ava = await signedInUser(testApp.authService, 'Ava Traveller');
    const ben = await signedInUser(testApp.authService, 'Ben Traveller');
    testApp.liveEvents.subscribe(() => {
      throw new Error('Simulated socket failure');
    });

    const response = await request(testApp.app).post('/api/friends/requests').set(ava.authorization).send({ userId: ben.userId });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: ben.userId, friendship: 'requested' });
    expect(consoleError).toHaveBeenCalledWith('Failed to push a live event', expect.any(Error));
  });

  // Mocked behavior: looking up the name of the traveller who acted fails
  // Input: Ava asks Ben to be friends while Ben's device is connected
  // Expected status code: 201
  // Expected behavior: the event still reaches Ben, naming "Someone"; the failure is logged
  // Expected output: liveEvent friendRequest with the text "Someone sent you a friend request"
  test('Naming the traveller who acted fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const testApp = createTestApp();
    const ava = await signedInUser(testApp.authService, 'Ava Traveller');
    const ben = await signedInUser(testApp.authService, 'Ben Traveller');
    const live = await startLiveServer(testApp);
    const benSocket = await connectClient(live.url, ben.authorization);
    const findById = UserModel.findById.bind(UserModel);
    // Only the name lookup (the one with a projection) fails; reading the travellers themselves still works.
    jest.spyOn(UserModel, 'findById').mockImplementation(((id: string, projection?: object) => {
      if (projection !== undefined) {
        throw new Error('Simulated database outage');
      }
      return findById(id);
    }) as never);

    const received = new Promise<LiveEvent>((resolve) => benSocket.once('liveEvent', resolve));
    const response = await request(testApp.app).post('/api/friends/requests').set(ava.authorization).send({ userId: ben.userId });
    const event = await received;

    expect(response.status).toBe(201);
    expect(event).toMatchObject({ type: 'friendRequest', actorId: ava.userId, text: 'Someone sent you a friend request' });
    expect(consoleError).toHaveBeenCalledWith('Failed to name a live event', expect.any(Error));
    benSocket.disconnect();
    await live.close();
  });
});
