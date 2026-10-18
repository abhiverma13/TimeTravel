import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import type { ActivityDto } from '../../src/activities/activityService';
import { ReviewModel, type ReviewDto } from '../../src/activities/reviewModel';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

interface ReviewBody {
  review: ReviewDto;
  activity: ActivityDto;
}

async function activityIdFor(placeId: string): Promise<string> {
  const activity = await ActivityModel.findOne({ placeId });
  if (!activity) {
    throw new Error(`Seeded activity ${placeId} is missing`);
  }
  return activity._id.toString();
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface POST /api/activities/:activityId/reviews
describe('Unmocked: POST /api/activities/:activityId/reviews', () => {
  // Input: rating 4 with a comment, from a traveller who has not reviewed this activity
  // Expected status code: 201
  // Expected behavior: the review is stored and the activity's review count and community score are updated
  // Expected output: { review: { rating: 4, comment }, activity: { reviewCount: 1, communityScore } }
  test('First review of an activity', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await activityIdFor('demo-vancouver-aquarium');

    const response = await request(app)
      .post(`/api/activities/${activityId}/reviews`)
      .set(authorization)
      .send({ rating: 4, comment: '  Plan two hours for the jellyfish.  ' });

    const body = response.body as ReviewBody;
    expect(response.status).toBe(201);
    expect(body.review).toMatchObject({ activityId, rating: 4, comment: 'Plan two hours for the jellyfish.' });
    expect(body.activity.reviewCount).toBe(1);
    expect(await ReviewModel.countDocuments({ activityId })).toBe(1);
  });

  // Input: rating 5 from the same traveller who earlier rated the activity 1
  // Expected status code: 200
  // Expected behavior: the existing review is edited, not duplicated; the score uses the new rating only
  // Expected output: { review: { rating: 5 }, activity: { reviewCount: 1 } } with a higher score than after the 1-star review
  test('Reviewing again edits the review', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await activityIdFor('demo-science-world');
    const first = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 1 });

    const second = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 5 });

    const firstBody = first.body as ReviewBody;
    const secondBody = second.body as ReviewBody;
    expect(second.status).toBe(200);
    expect(secondBody.review.id).toBe(firstBody.review.id);
    expect(secondBody.activity.reviewCount).toBe(1);
    expect(secondBody.activity.communityScore).toBeGreaterThan(firstBody.activity.communityScore);
    expect(await ReviewModel.countDocuments({ activityId })).toBe(1);
  });

  // Input: a single 5-star review of a modestly rated activity (Chinatown, 4.1)
  // Expected status code: 201
  // Expected behavior: the score moves up but stays shrunk toward the city mean
  // Expected output: Chinatown's community score is still below Stanley Park Seawall's
  test('One 5-star review cannot outrank a well-reviewed landmark', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const chinatownId = await activityIdFor('demo-chinatown');

    const response = await request(app).post(`/api/activities/${chinatownId}/reviews`).set(authorization).send({ rating: 5 });
    const list = await request(app).get('/api/activities').query({ city: 'Vancouver' }).set(authorization);

    const activities = (list.body as { activities: ActivityDto[] }).activities;
    const seawall = activities.find((activity) => activity.name === 'Stanley Park Seawall');
    expect(response.status).toBe(201);
    expect((response.body as ReviewBody).activity.communityScore).toBeLessThan(seawall?.communityScore ?? 0);
  });

  // Input: rating 5 with tags { durationMinutes: 150, bestTimeOfDay: "morning", cost: "low", setting: "indoor" }
  // Expected status code: 201
  // Expected behavior: the tags are stored with the review and counted on the activity
  // Expected output: the review echoes the tags; the activity's communityTags show them
  test('Review with structured tags', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await activityIdFor('demo-vancouver-aquarium');
    const tags = { durationMinutes: 150, bestTimeOfDay: 'morning', cost: 'low', setting: 'indoor' };

    const response = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 5, tags });

    const body = response.body as ReviewBody;
    expect(response.status).toBe(201);
    expect(body.review.tags).toEqual(tags);
    expect(body.activity.communityTags).toEqual({ bestTimeOfDay: 'morning', cost: 'low', setting: 'indoor' });
    // One duration report is not enough to replace the typical 2-hour aquarium visit.
    expect(body.activity.durationMinutes).toBe(120);
  });

  // Input: two travellers report visit lengths of 60 and 100 minutes for the aquarium
  // Expected status code: 201 for both
  // Expected behavior: with two reports, their average (rounded to 15 minutes) replaces the typical visit length
  // Expected output: durationMinutes 75 in the second response and in the activity list
  test("Travellers' reported visit length replaces the typical one", async () => {
    const { app, authService, activityService } = createTestApp();
    const first = await signedInUser(authService, 'First Visitor');
    const second = await signedInUser(authService, 'Second Visitor');
    await seedVancouver(activityService);
    const activityId = await activityIdFor('demo-vancouver-aquarium');

    await request(app).post(`/api/activities/${activityId}/reviews`).set(first.authorization).send({ rating: 4, tags: { durationMinutes: 60 } });
    const response = await request(app)
      .post(`/api/activities/${activityId}/reviews`)
      .set(second.authorization)
      .send({ rating: 4, tags: { durationMinutes: 100 } });

    expect((response.body as ReviewBody).activity.durationMinutes).toBe(75);
  });

  // Input: a traveller tags an activity "indoor", then edits the review to "outdoor"
  // Expected status code: 200 for the edit
  // Expected behavior: the old tag is taken back, so the activity is not counted twice
  // Expected output: communityTags.setting "outdoor"
  test('Editing a review moves its tags', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const activityId = await activityIdFor('demo-science-world');
    await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 4, tags: { setting: 'indoor' } });

    const response = await request(app)
      .post(`/api/activities/${activityId}/reviews`)
      .set(authorization)
      .send({ rating: 4, tags: { setting: 'outdoor' } });

    expect(response.status).toBe(200);
    expect((response.body as ReviewBody).activity.communityTags.setting).toBe('outdoor');
    const stored = await ActivityModel.findOne({ placeId: 'demo-science-world' });
    expect(stored?.get('tagCounts.indoor')).toBe(0);
  });

  // Input: ratings 0, 6 and 3.5, a 501-character comment, no rating, and out-of-range or unknown tags
  // Expected status code: 400 for each
  // Expected behavior: nothing is stored
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([
    { rating: 0 },
    { rating: 6 },
    { rating: 3.5 },
    { rating: 4, comment: 'x'.repeat(501) },
    {},
    { rating: 4, tags: { durationMinutes: 5 } },
    { rating: 4, tags: { bestTimeOfDay: 'midnight' } },
    { rating: 4, tags: { cost: 'priceless' } },
    { rating: 4, tags: { setting: 'underwater' } },
  ])(
    'Invalid review %p',
    async (invalidBody) => {
      const { app, authService, activityService } = createTestApp();
      const { authorization } = await signedInUser(authService);
      await seedVancouver(activityService);
      const activityId = await activityIdFor('demo-vancouver-aquarium');

      const response = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send(invalidBody);

      expect(response.status).toBe(400);
      expect(await ReviewModel.countDocuments()).toBe(0);
    },
  );

  // Input: an activity id that is not a valid id, and a valid id that matches no activity
  // Expected status code: 404 for both
  // Expected behavior: nothing is stored
  // Expected output: { error: "Activity not found" }
  test.each(['not-an-id', '64b7f0c2a1b2c3d4e5f60718'])('Unknown activity %s', async (activityId) => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).post(`/api/activities/${activityId}/reviews`).set(authorization).send({ rating: 4 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Activity not found' });
  });

  // Input: a valid review without an Authorization header
  // Expected status code: 401
  // Expected behavior: nothing is stored
  // Expected output: { error: "Missing session token" }
  test('Not signed in', async () => {
    const { app, activityService } = createTestApp();
    await seedVancouver(activityService);
    const activityId = await activityIdFor('demo-vancouver-aquarium');

    const response = await request(app).post(`/api/activities/${activityId}/reviews`).send({ rating: 4 });

    expect(response.status).toBe(401);
    expect(await ReviewModel.countDocuments()).toBe(0);
  });
});
