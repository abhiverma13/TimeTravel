import request from 'supertest';

import { PostModel } from '../../src/posts/postModel';
import type { PostDetailDto } from '../../src/posts/postService';
import type { TripDto } from '../../src/trips/tripService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

const simulatedOutage = () => {
  throw new Error('Simulated database outage');
};

/** Ava's shared Testville trip, and Ben's unchanged copy of it. */
async function copiedTrip() {
  const { app, authService, activityService } = createTestApp();
  await seedTestville(activityService);
  const ava = await signedInUser(authService, 'Ava Planner');
  const ben = await signedInUser(authService, 'Ben Taker');
  const tripId = await storeTestvilleTrip(ava.userId, ['Morning Bakery', 'Harbour Park']);
  const original = (await request(app).post('/api/posts').set(ava.authorization).send({ tripId, rating: 5 })).body as PostDetailDto;
  const copy = (await request(app).post(`/api/posts/${original.id}/copy`).set(ben.authorization).send({ startDate: '2026-10-31' })).body as TripDto;
  return { app, ava, ben, original, copy };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /api/posts (a copied trip)
describe('Mocked: POST /api/posts for a copied trip', () => {
  // Mocked behavior: looking up the original post fails
  // Input: Ben shares his unchanged copy of Ava's trip
  // Expected status code: 500
  // Expected behavior: the error is handled and nothing is posted; the server keeps running
  // Expected output: { error: "Internal server error" }
  test('Original post lookup fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, ben, copy } = await copiedTrip();
    jest.spyOn(PostModel, 'findById').mockImplementation(simulatedOutage);

    const response = await request(app).post('/api/posts').set(ben.authorization).send({ tripId: copy.id, rating: 4 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    jest.restoreAllMocks();
    expect(await PostModel.countDocuments({ authorId: ben.userId })).toBe(0);
  });
});

// Interface GET /api/posts/:postId/takers
describe('Mocked: GET /api/posts/:postId/takers', () => {
  // Mocked behavior: reading the linked copies fails
  // Input: Ben asks who took Ava's trip
  // Expected status code: 500
  // Expected behavior: the error is handled; the server keeps running
  // Expected output: { error: "Internal server error" }
  test('Post database read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, ben, original } = await copiedTrip();
    jest.spyOn(PostModel, 'find').mockImplementation(simulatedOutage);

    const response = await request(app).get(`/api/posts/${original.id}/takers`).set(ben.authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
