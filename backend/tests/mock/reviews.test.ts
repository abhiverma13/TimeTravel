import request from 'supertest';

import { ActivityModel, CityCatalogueModel } from '../../src/activities/activityModel';
import type { ActivityDto } from '../../src/activities/activityService';
import { ReviewModel } from '../../src/activities/reviewModel';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

async function aquariumId(): Promise<string> {
  const activity = await ActivityModel.findOne({ placeId: 'demo-vancouver-aquarium' });
  if (!activity) {
    throw new Error('Seeded aquarium is missing');
  }
  return activity._id.toString();
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /api/activities/:activityId/reviews
describe('Mocked: POST /api/activities/:activityId/reviews', () => {
  // Mocked behavior: saving the review to the review database fails
  // Input: { rating: 4 } for an existing activity
  // Expected status code: 500
  // Expected behavior: the activity's review counters are left unchanged
  // Expected output: { error: "Internal server error" }
  test('Review database write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await aquariumId();
    jest.spyOn(ReviewModel, 'create').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 4 });

    expect(response.status).toBe(500);
    expect((await ActivityModel.findById(activityId))?.reviewCount).toBe(0);
  });

  // Mocked behavior: the activity disappears between the existence check and the final read
  // Input: { rating: 4 } for an activity that is concurrently deleted
  // Expected status code: 404
  // Expected behavior: the traveller is told the activity no longer exists
  // Expected output: { error: "Activity not found" }
  test('Activity removed during the review', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await aquariumId();
    jest.spyOn(ActivityModel, 'findById').mockResolvedValueOnce(null);

    const response = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 4 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Activity not found' });
  });

  // Mocked behavior: the city catalogue record is missing (e.g. deleted by an operator)
  // Input: { rating: 4 } for an existing activity
  // Expected status code: 201
  // Expected behavior: the community score falls back to the default city mean rating of 4
  // Expected output: { review, activity } with a numeric community score
  test('City catalogue missing', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await aquariumId();
    jest.spyOn(CityCatalogueModel, 'findOne').mockResolvedValueOnce(null);

    const response = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 4 });

    expect(response.status).toBe(201);
    expect(typeof (response.body as { activity: ActivityDto }).activity.communityScore).toBe('number');
  });

  // Mocked behavior: checking the reviewer's trips for that day fails
  // Input: 5 stars with the reviewer's position at Harbour Park
  // Expected status code: 500
  // Expected behavior: no review is saved
  // Expected output: { error: "Internal server error" }
  test('Itinerary database fails while verifying a visit', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService, activityService } = createTestApp({ now: () => new Date('2026-10-24T18:00:00Z') });
    const { userId, authorization } = await signedInUser(authService);
    await seedTestville(activityService);
    await storeTestvilleTrip(userId, ['Harbour Park']);
    const parkId = (await ActivityModel.findOne({ name: 'Harbour Park' }))?._id.toString() ?? '';
    jest.spyOn(ItineraryModel, 'countDocuments').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app)
      .post(`/api/activities/${parkId}/reviews`)
      .set(authorization)
      .send({ rating: 5, location: { lat: 49.281, lng: -123.119 } });

    expect(response.status).toBe(500);
    expect(await ReviewModel.countDocuments()).toBe(0);
  });
});

// Interface GET /api/activities/:activityId/reviews
describe('Mocked: GET /api/activities/:activityId/reviews', () => {
  // Mocked behavior: reading the reviews fails
  // Input: an activity's id
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Review database fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);
    const parkId = (await ActivityModel.findOne({ name: 'Harbour Park' }))?._id.toString() ?? '';
    jest.spyOn(ReviewModel, 'find').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });

    const response = await request(app).get(`/api/activities/${parkId}/reviews`).set(authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
