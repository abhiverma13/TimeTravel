import request from 'supertest';
import mongoose from 'mongoose';

import { ActivityModel, CityCatalogueModel } from '../../src/activities/activityModel';
import type { ActivityDto } from '../../src/activities/activityService';
import { ReviewModel } from '../../src/activities/reviewModel';
import { TripModel } from '../../src/trips/tripModel';
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
  // Mocked behavior: another request saves the same traveller's review of the activity just before this one creates it
  //                 (the unique index refuses the second create)
  // Input: { rating: 4 } for an activity the traveller had not reviewed
  // Expected status code: 200
  // Expected behavior: the save is redone as an edit of the review that won, so the activity counts one review
  // Expected output: the review with rating 4; the activity has 1 review summing to 4
  test('Another save of the same review gets in first', async () => {
    const { app, authService, activityService } = createTestApp();
    const { userId, authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await aquariumId();
    const create = ReviewModel.create.bind(ReviewModel);
    jest.spyOn(ReviewModel, 'create').mockImplementationOnce((async () => {
      await create({ activityId, userId, rating: 2 });
      await ActivityModel.updateOne({ _id: activityId }, { $inc: { reviewCount: 1, reviewRatingSum: 2 } });
      throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    }) as never);

    const response = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 4 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ review: { rating: 4 } });
    expect(await ActivityModel.findById(activityId)).toMatchObject({ reviewCount: 1, reviewRatingSum: 4 });
  });

  // Mocked behavior: every attempt to create the review is refused as a duplicate (another save keeps winning)
  // Input: { rating: 4 }
  // Expected status code: 409
  // Expected behavior: after a few attempts the traveller is asked to try again; nothing is counted
  // Expected output: { error: "This was just saved by another request; please try again" }
  test('Saves of the same review keep clashing', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await aquariumId();
    jest.spyOn(ReviewModel, 'create').mockImplementation(() => {
      throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    });

    const response = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 4 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'This was just saved by another request; please try again' });
    expect((await ActivityModel.findById(activityId))?.reviewCount).toBe(0);
  });

  // Mocked behavior: the traveller's review changes between being read and being saved (a version clash)
  // Input: an edit of an existing review, { rating: 5 }
  // Expected status code: 200
  // Expected behavior: the edit is redone on the latest review, so the counters stay right
  // Expected output: the review with rating 5; the activity's ratings sum to 5
  test('An edit clashes with another edit', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await aquariumId();
    await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 3 });
    jest.spyOn(ReviewModel.prototype, 'save').mockImplementationOnce(function (this: never) {
      throw new mongoose.Error.VersionError(this, 0, []);
    });

    const response = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 5 });

    expect(response.status).toBe(200);
    expect(await ActivityModel.findById(activityId)).toMatchObject({ reviewCount: 1, reviewRatingSum: 5 });
  });

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
  test('Trip database fails while verifying a visit', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService, activityService } = createTestApp({ now: () => new Date('2026-10-24T18:00:00Z') });
    const { userId, authorization } = await signedInUser(authService);
    await seedTestville(activityService);
    await storeTestvilleTrip(userId, ['Harbour Park']);
    const parkId = (await ActivityModel.findOne({ name: 'Harbour Park' }))?._id.toString() ?? '';
    jest.spyOn(TripModel, 'countDocuments').mockImplementation(() => {
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
