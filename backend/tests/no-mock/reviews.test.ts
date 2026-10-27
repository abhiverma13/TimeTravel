import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import type { ActivityDto, ReviewListItemDto } from '../../src/activities/activityService';
import { ReviewModel, type ReviewDto } from '../../src/activities/reviewModel';
import type { GroupDto } from '../../src/groups/groupService';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

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

// Harbour Park in Testville, and a point about 1 km from it.
const AT_HARBOUR_PARK = { lat: 49.281, lng: -123.119 };
const ONE_KM_AWAY = { lat: 49.29, lng: -123.119 };

/**
 * A traveller with Harbour Park in a Testville trip on Saturday 2026-10-24 (their own, or their group's), and a server
 * clock on `today`. Returns a function that reviews Harbour Park.
 */
async function harbourParkVisit(options: { today?: string; groupTrip?: boolean } = {}) {
  const today = options.today ?? '2026-10-24';
  const { app, authService, activityService } = createTestApp({ now: () => new Date(`${today}T18:00:00Z`) });
  await seedTestville(activityService);
  const traveller = await signedInUser(authService, 'Rita Reviewer');
  const owner = await signedInUser(authService, 'Gus Groupowner');
  if (options.groupTrip === true) {
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Park crew' })).body as GroupDto;
    await request(app).post('/api/groups/join').set(traveller.authorization).send({ inviteCode: group.inviteCode });
    await storeTestvilleTrip(owner.userId, ['Harbour Park'], { groupId: group.id });
  } else {
    await storeTestvilleTrip(traveller.userId, ['Harbour Park']);
  }
  const parkId = (await ActivityModel.findOne({ name: 'Harbour Park' }))?._id.toString() ?? '';
  const review = async (body: object, who = traveller) =>
    request(app).post(`/api/activities/${parkId}/reviews`).set(who.authorization).send({ rating: 5, ...body });
  return { app, traveller, owner, parkId, review };
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

  // Input: 5 stars with the reviewer's position at Harbour Park, on the day it is in their own trip, or in their group's
  // Expected status code: 201
  // Expected behavior: the review is verified, and counts twice in the community score
  // Expected output: review.verified true; verifiedReviewCount 1; a higher score than the same review unverified
  test.each([
    ['their own trip', false],
    ["their group's trip", true],
  ])('A review written at the place on a trip day is verified: %s', async (_scenario, groupTrip) => {
    const verifiedVisit = await harbourParkVisit({ groupTrip });
    const verified = await verifiedVisit.review({ location: AT_HARBOUR_PARK });
    await clearTestDatabase();
    const plainVisit = await harbourParkVisit({ groupTrip });
    const plain = await plainVisit.review({});

    const body = verified.body as ReviewBody;
    expect(verified.status).toBe(201);
    expect(body.review.verified).toBe(true);
    expect(body.activity.verifiedReviewCount).toBe(1);
    expect(body.activity.reviewCount).toBe(1);
    expect(body.activity.communityScore).toBeGreaterThan((plain.body as ReviewBody).activity.communityScore);
  });

  // Input: 5 stars with a position 1 km from the place; with the position at the place but on another day of the
  //        calendar; and with no position
  // Expected status code: 201 for each
  // Expected behavior: the review is saved but not verified
  // Expected output: review.verified false; verifiedReviewCount 0
  test.each([
    ['too far from the place', '2026-10-24', ONE_KM_AWAY],
    ['not in a trip that day', '2026-10-25', AT_HARBOUR_PARK],
    ['no position', '2026-10-24', undefined],
  ])('Not verified: %s', async (_scenario, today, location) => {
    const { review } = await harbourParkVisit({ today });

    const response = await review(location === undefined ? {} : { location });

    const body = response.body as ReviewBody;
    expect(response.status).toBe(201);
    expect(body.review.verified).toBe(false);
    expect(body.activity.verifiedReviewCount).toBe(0);
  });

  // Input: a review without a position, then edited at the place (4 stars), then edited again without a position (3 stars)
  // Expected status code: 201, 200, 200
  // Expected behavior: the edit at the place verifies the review; a verified review stays verified, counted once
  // Expected output: verified false, true, true; verifiedReviewCount 0, 1, 1
  test('A review verified by an edit stays verified', async () => {
    const { review } = await harbourParkVisit();

    const first = (await review({})).body as ReviewBody;
    const atThePlace = (await review({ rating: 4, location: AT_HARBOUR_PARK })).body as ReviewBody;
    const later = (await review({ rating: 3 })).body as ReviewBody;

    expect([first.review.verified, atThePlace.review.verified, later.review.verified]).toEqual([false, true, true]);
    expect([first, atThePlace, later].map((body) => body.activity.verifiedReviewCount)).toEqual([0, 1, 1]);
    expect(later.activity.reviewCount).toBe(1);
  });

  // Input: a position with latitude 91
  // Expected status code: 400
  // Expected behavior: nothing is saved
  // Expected output: { error: "Invalid request", details: [...] }
  test('Invalid position', async () => {
    const { review } = await harbourParkVisit();

    const response = await review({ location: { lat: 91, lng: -123.119 } });

    expect(response.status).toBe(400);
    expect(await ReviewModel.countDocuments()).toBe(0);
  });
});

// Interface GET /api/activities/:activityId/reviews
describe('Unmocked: GET /api/activities/:activityId/reviews', () => {
  // Input: Gus reviews Harbour Park first without being there; Rita reviews it later at the place on her trip day
  // Expected status code: 200
  // Expected behavior: verified reviews come first, each with its author
  // Expected output: Rita's verified review, then Gus's
  test('Lists reviews, verified first', async () => {
    const { app, traveller, owner, parkId, review } = await harbourParkVisit();
    await review({ comment: 'Nice benches' }, owner);
    await review({ comment: 'Lovely at sunset', location: AT_HARBOUR_PARK });

    const response = await request(app).get(`/api/activities/${parkId}/reviews`).set(traveller.authorization);

    const { reviews } = response.body as { reviews: ReviewListItemDto[] };
    expect(response.status).toBe(200);
    expect(reviews.map((item) => [item.author, item.comment, item.verified])).toEqual([
      ['Rita Reviewer', 'Lovely at sunset', true],
      ['Gus Groupowner', 'Nice benches', false],
    ]);
  });

  // Input: an activity id no activity has, and one that is not an id
  // Expected status code: 404 for both
  // Expected behavior: nothing is listed
  // Expected output: { error: "Activity not found" }
  test.each(['64b7f0c2a1b2c3d4e5f60718', 'not-an-id'])('Unknown activity %p', async (activityId) => {
    const { app, traveller } = await harbourParkVisit();

    const response = await request(app).get(`/api/activities/${activityId}/reviews`).set(traveller.authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Activity not found' });
  });
});
