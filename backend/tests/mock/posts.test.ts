import request from 'supertest';

import type { GeoPoint } from '../../src/itineraries/engine/types';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import type { RoutesClient } from '../../src/itineraries/routesClient';
import { CommentModel, PostModel } from '../../src/posts/postModel';
import type { CommentDto, PostDetailDto } from '../../src/posts/postService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

type Traveller = Awaited<ReturnType<typeof signedInUser>>;

function simulatedOutage(): never {
  throw new Error('Simulated database outage');
}

// A Google Routes client that says every trip takes this many minutes.
function routesTaking(minutes: number): RoutesClient {
  return {
    computeMatrix: jest.fn(async (origins: readonly GeoPoint[], destinations: readonly GeoPoint[]) =>
      Promise.resolve(origins.flatMap((_, originIndex) => destinations.map((__, destinationIndex) => ({ originIndex, destinationIndex, minutes })))),
    ),
  };
}

// Ava's shared Testville trip, and Ben to react to it; server errors are kept out of the test output.
async function sharedPost(routesClient?: RoutesClient) {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const { app, authService, activityService } = createTestApp(routesClient === undefined ? {} : { routesClient });
  await seedTestville(activityService);
  const ava = await signedInUser(authService, 'Ava Traveller');
  const ben = await signedInUser(authService, 'Ben Traveller');
  const itineraryId = await storeTestvilleTrip(ava.userId, ['Morning Bakery', 'Harbour Park']);
  const post = (await request(app).post('/api/posts').set(ava.authorization).send({ itineraryId, rating: 5 })).body as PostDetailDto;
  const as = (user: Traveller) => ({
    get: (path: string) => request(app).get(path).set(user.authorization),
    post: (path: string, body: object = {}) => request(app).post(path).set(user.authorization).send(body),
    put: (path: string) => request(app).put(path).set(user.authorization),
    delete: (path: string) => request(app).delete(path).set(user.authorization),
  });
  return { app, ava, ben, itineraryId, post, as };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /api/posts
describe('Mocked: POST /api/posts', () => {
  // Mocked behavior: saving the post fails
  // Input: Ava shares her trip again
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Post database write fails', async () => {
    const { ava, itineraryId, as } = await sharedPost();
    jest.spyOn(PostModel, 'create').mockImplementation(simulatedOutage);

    const response = await as(ava).post('/api/posts', { itineraryId, rating: 4 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// Interface GET /api/posts
describe('Mocked: GET /api/posts', () => {
  // Mocked behavior: counting the posts' comments fails
  // Input: Ben reads the everyone feed
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Comment database fails', async () => {
    const { ben, as } = await sharedPost();
    jest.spyOn(CommentModel, 'aggregate').mockImplementation(simulatedOutage);

    const response = await as(ben).get('/api/posts');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// Interface GET /api/posts/:postId
describe('Mocked: GET /api/posts/:postId', () => {
  // Mocked behavior: counting the post's comments fails
  // Input: Ben opens Ava's post
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Comment database fails', async () => {
    const { ben, post, as } = await sharedPost();
    jest.spyOn(CommentModel, 'countDocuments').mockImplementation(simulatedOutage);

    const response = await as(ben).get(`/api/posts/${post.id}`);

    expect(response.status).toBe(500);
  });
});

// Interface DELETE /api/posts/:postId
describe('Mocked: DELETE /api/posts/:postId', () => {
  // Mocked behavior: deleting the post's comments fails
  // Input: Ava deletes her post
  // Expected status code: 500
  // Expected behavior: the post is kept, so no comments are left without their post
  // Expected output: { error: "Internal server error" }
  test('Comment database write fails', async () => {
    const { ava, post, as } = await sharedPost();
    jest.spyOn(CommentModel, 'deleteMany').mockImplementation(simulatedOutage);

    const response = await as(ava).delete(`/api/posts/${post.id}`);

    expect(response.status).toBe(500);
    expect(await PostModel.countDocuments()).toBe(1);
  });
});

// Interface PUT /api/posts/:postId/like
describe('Mocked: PUT /api/posts/:postId/like', () => {
  // Mocked behavior: the post is deleted between the visibility check and saving the like
  // Input: Ben likes Ava's post
  // Expected status code: 404
  // Expected behavior: nothing is saved
  // Expected output: { error: "Post not found" }
  test('Post deleted while liking it', async () => {
    const { ben, post, as } = await sharedPost();
    jest.spyOn(PostModel, 'findByIdAndUpdate').mockResolvedValueOnce(null);

    const response = await as(ben).put(`/api/posts/${post.id}/like`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Post not found' });
  });
});

// Interface DELETE /api/posts/:postId/like
describe('Mocked: DELETE /api/posts/:postId/like', () => {
  // Mocked behavior: saving the unlike fails
  // Input: Ben unlikes Ava's post
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Post database write fails', async () => {
    const { ben, post, as } = await sharedPost();
    jest.spyOn(PostModel, 'findByIdAndUpdate').mockImplementation(simulatedOutage);

    const response = await as(ben).delete(`/api/posts/${post.id}/like`);

    expect(response.status).toBe(500);
  });
});

// Interface GET /api/posts/:postId/comments
describe('Mocked: GET /api/posts/:postId/comments', () => {
  // Mocked behavior: reading the comments fails
  // Input: Ben reads the comments of Ava's post
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Comment database fails', async () => {
    const { ben, post, as } = await sharedPost();
    jest.spyOn(CommentModel, 'find').mockImplementation(simulatedOutage);

    const response = await as(ben).get(`/api/posts/${post.id}/comments`);

    expect(response.status).toBe(500);
  });
});

// Interface POST /api/posts/:postId/comments
describe('Mocked: POST /api/posts/:postId/comments', () => {
  // Mocked behavior: saving the comment fails
  // Input: Ben comments on Ava's post
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Comment database write fails', async () => {
    const { ben, post, as } = await sharedPost();
    jest.spyOn(CommentModel, 'create').mockImplementation(simulatedOutage);

    const response = await as(ben).post(`/api/posts/${post.id}/comments`, { text: 'Looks fun' });

    expect(response.status).toBe(500);
  });
});

// Interface DELETE /api/posts/:postId/comments/:commentId
describe('Mocked: DELETE /api/posts/:postId/comments/:commentId', () => {
  // Mocked behavior: deleting the comment fails
  // Input: Ben deletes his comment
  // Expected status code: 500
  // Expected behavior: the comment is kept
  // Expected output: { error: "Internal server error" }
  test('Comment database write fails', async () => {
    const { ben, post, as } = await sharedPost();
    const comment = (await as(ben).post(`/api/posts/${post.id}/comments`, { text: 'Looks fun' })).body as CommentDto;
    jest.spyOn(CommentModel, 'deleteOne').mockImplementation(simulatedOutage);

    const response = await as(ben).delete(`/api/posts/${post.id}/comments/${comment.id}`);

    expect(response.status).toBe(500);
    expect(await CommentModel.countDocuments()).toBe(1);
  });
});

// Interface POST /api/posts/:postId/copy
describe('Mocked: POST /api/posts/:postId/copy', () => {
  // Mocked behavior: Google Routes says every trip takes 9 minutes
  // Input: Ben copies Ava's post to 2026-11-02
  // Expected status code: 201
  // Expected behavior: the copy is re-timed with Google Routes travel times
  // Expected output: every leg takes 9 minutes; travelTimeSource "google-routes"
  test('The copy uses Google Routes travel times', async () => {
    const { ben, post, as } = await sharedPost(routesTaking(9));

    const response = await as(ben).post(`/api/posts/${post.id}/copy`, { startDate: '2026-11-02' });

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(itinerary.travelTimeSource).toBe('google-routes');
    expect(itinerary.days.flatMap((day) => day.stops.map((stop) => stop.travelMinutes))).toEqual([9, 9]);
  });

  // Mocked behavior: saving the new itinerary fails
  // Input: Ben copies Ava's post
  // Expected status code: 500
  // Expected behavior: no trip is created
  // Expected output: { error: "Internal server error" }
  test('Itinerary database write fails', async () => {
    const { ben, post, as } = await sharedPost();
    jest.spyOn(ItineraryModel, 'create').mockImplementation(simulatedOutage);

    const response = await as(ben).post(`/api/posts/${post.id}/copy`, { startDate: '2026-11-02' });

    expect(response.status).toBe(500);
    expect(await ItineraryModel.countDocuments({ userId: ben.userId })).toBe(0);
  });
});
