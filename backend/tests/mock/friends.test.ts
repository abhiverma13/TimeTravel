import request from 'supertest';

import { UserModel } from '../../src/auth/userModel';
import { FriendshipModel, pairKey } from '../../src/friends/friendshipModel';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

function simulatedOutage(): never {
  throw new Error('Simulated database outage');
}

function duplicateKeyError(): Error {
  return Object.assign(new Error('E11000 duplicate key error collection: friendships index: pair_1'), { code: 11000 });
}

// Two signed-in travellers, with server errors kept out of the test output.
async function twoTravellers() {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const { app, authService } = createTestApp();
  const ava = await signedInUser(authService, 'Ava Traveller');
  const ben = await signedInUser(authService, 'Ben Traveller');
  return { app, ava, ben };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface GET /api/travellers
describe('Mocked: GET /api/travellers', () => {
  // Mocked behavior: the user database query fails
  // Input: a search for "travel"
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('User database fails', async () => {
    const { app, ava } = await twoTravellers();
    jest.spyOn(UserModel, 'find').mockImplementation(simulatedOutage);

    const response = await request(app).get('/api/travellers?search=travel').set(ava.authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// Interface GET /api/travellers/:userId
describe('Mocked: GET /api/travellers/:userId', () => {
  // Mocked behavior: counting the traveller's friends fails
  // Input: Ava views Ben
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Friendship database fails', async () => {
    const { app, ava, ben } = await twoTravellers();
    jest.spyOn(FriendshipModel, 'countDocuments').mockImplementation(simulatedOutage);

    const response = await request(app).get(`/api/travellers/${ben.userId}`).set(ava.authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// Interface GET /api/friends
describe('Mocked: GET /api/friends', () => {
  // Mocked behavior: reading the caller's friendships fails
  // Input: a signed-in traveller
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Friendship database fails', async () => {
    const { app, ava } = await twoTravellers();
    jest.spyOn(FriendshipModel, 'find').mockImplementation(simulatedOutage);

    const response = await request(app).get('/api/friends').set(ava.authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// Interface POST /api/friends/requests
describe('Mocked: POST /api/friends/requests', () => {
  // Mocked behavior: while Ava's request is being saved, Ben's request to Ava is saved first, so Ava's insert hits the
  //                  unique pair index
  // Input: Ava asks Ben
  // Expected status code: 200
  // Expected behavior: Ben's request stands and nothing is duplicated
  // Expected output: Ben with friendship "incoming"
  test('Both travellers ask each other at the same moment', async () => {
    const { app, ava, ben } = await twoTravellers();
    const create = FriendshipModel.create.bind(FriendshipModel);
    jest.spyOn(FriendshipModel, 'create').mockImplementationOnce(async () => {
      await create({ requesterId: ben.userId, recipientId: ava.userId, status: 'pending', pair: pairKey(ava.userId, ben.userId) });
      throw duplicateKeyError();
    });

    const response = await request(app).post('/api/friends/requests').set(ava.authorization).send({ userId: ben.userId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: ben.userId, friendship: 'incoming' });
    expect(await FriendshipModel.countDocuments()).toBe(1);
  });

  // Mocked behavior: saving the request fails for another reason
  // Input: Ava asks Ben
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Friendship database write fails', async () => {
    const { app, ava, ben } = await twoTravellers();
    jest.spyOn(FriendshipModel, 'create').mockImplementation(simulatedOutage);

    const response = await request(app).post('/api/friends/requests').set(ava.authorization).send({ userId: ben.userId });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// Interface POST /api/friends/requests/:userId/accept
describe('Mocked: POST /api/friends/requests/:userId/accept', () => {
  // Mocked behavior: saving the acceptance fails
  // Input: Ava accepts Ben's request
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Friendship database write fails', async () => {
    const { app, ava, ben } = await twoTravellers();
    await request(app).post('/api/friends/requests').set(ben.authorization).send({ userId: ava.userId });
    jest.spyOn(FriendshipModel, 'findOneAndUpdate').mockImplementation(simulatedOutage);

    const response = await request(app).post(`/api/friends/requests/${ben.userId}/accept`).set(ava.authorization);

    expect(response.status).toBe(500);
    expect((await FriendshipModel.findOne())?.status).toBe('pending');
  });
});

// Interface DELETE /api/friends/:userId
describe('Mocked: DELETE /api/friends/:userId', () => {
  // Mocked behavior: deleting the friendship fails
  // Input: Ava removes Ben, her friend
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Friendship database write fails', async () => {
    const { app, ava, ben } = await twoTravellers();
    await request(app).post('/api/friends/requests').set(ben.authorization).send({ userId: ava.userId });
    jest.spyOn(FriendshipModel, 'deleteOne').mockImplementation(simulatedOutage);

    const response = await request(app).delete(`/api/friends/${ben.userId}`).set(ava.authorization);

    expect(response.status).toBe(500);
    expect(await FriendshipModel.countDocuments()).toBe(1);
  });
});

// Interface PUT /api/friends/privacy
describe('Mocked: PUT /api/friends/privacy', () => {
  // Mocked behavior: saving the setting fails
  // Input: { isPrivate: true }
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('User database write fails', async () => {
    const { app, ava } = await twoTravellers();
    jest.spyOn(UserModel, 'findByIdAndUpdate').mockImplementation(simulatedOutage);

    const response = await request(app).put('/api/friends/privacy').set(ava.authorization).send({ isPrivate: true });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
