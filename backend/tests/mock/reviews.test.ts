import request from 'supertest';

import { ActivityModel, CityCatalogueModel } from '../../src/activities/activityModel';
import type { ActivityDto } from '../../src/activities/activityService';
import { ReviewModel } from '../../src/activities/reviewModel';
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
});
