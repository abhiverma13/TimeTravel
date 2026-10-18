import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import type { ActivityDto } from '../../src/activities/activityService';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

interface ActivitiesBody {
  city: string;
  activities: ActivityDto[];
}

function activityNamed(body: ActivitiesBody, name: string): ActivityDto | undefined {
  return body.activities.find((activity) => activity.name === name);
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface GET /api/activities
describe('Unmocked: GET /api/activities', () => {
  // Input: city=Vancouver, with the Vancouver catalogue already cached in MongoDB
  // Expected status code: 200
  // Expected behavior: activities are served from the cache, best community score first
  // Expected output: { city: "Vancouver", activities: [...30 activities] }
  test('Cached city, best score first', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app).get('/api/activities').query({ city: 'Vancouver' }).set(authorization);

    const body = response.body as ActivitiesBody;
    expect(response.status).toBe(200);
    expect(body.city).toBe('Vancouver');
    expect(body.activities).toHaveLength(30);
    const scores = body.activities.map((activity) => activity.communityScore);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
    expect(activityNamed(body, 'Stanley Park Seawall')).toMatchObject({
      location: { lat: 49.3017, lng: -123.1417 },
      interests: ['outdoors', 'landmarks'],
      durationMinutes: 90,
      googleRating: 4.8,
      reviewCount: 0,
    });
  });

  // Input: city=Vancouver&interest=museums
  // Expected status code: 200
  // Expected behavior: only activities tagged "museums" are returned
  // Expected output: activities that all include "museums" in their interests
  test('Filter by interest', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app)
      .get('/api/activities')
      .query({ city: 'Vancouver', interest: 'museums' })
      .set(authorization);

    const body = response.body as ActivitiesBody;
    expect(response.status).toBe(200);
    expect(body.activities.length).toBeGreaterThan(0);
    expect(body.activities.every((activity) => activity.interests.includes('museums'))).toBe(true);
  });

  // Input: city="  vancouver " (different case and spacing from the cached "Vancouver")
  // Expected status code: 200
  // Expected behavior: the same cached catalogue is used
  // Expected output: the 30 Vancouver activities
  test('City name is case and space insensitive', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app).get('/api/activities').query({ city: '  vancouver ' }).set(authorization);

    expect(response.status).toBe(200);
    expect((response.body as ActivitiesBody).activities).toHaveLength(30);
  });

  // Input: city=Vancouver
  // Expected status code: 200
  // Expected behavior: Google opening periods are converted to per-weekday minute windows
  // Expected output: 24-hour places open all week; closed days are absent; after-midnight closes are cut at midnight
  test('Opening hours are converted', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app).get('/api/activities').query({ city: 'Vancouver' }).set(authorization);

    const body = response.body as ActivitiesBody;
    expect(activityNamed(body, 'Stanley Park Seawall')?.openingHours).toHaveLength(7);
    const anthropologyDays = activityNamed(body, 'Museum of Anthropology at UBC')?.openingHours?.map((period) => period.day);
    expect(anthropologyDays).not.toContain(1);
    expect(activityNamed(body, 'The Alibi Room')?.openingHours?.[0]).toEqual({ day: 0, openMinute: 1020, closeMinute: 1440 });
  });

  // Input: city=Atlantis, which is not cached, on a server without a Places API key
  // Expected status code: 503
  // Expected behavior: nothing is stored
  // Expected output: { error: "No activities are available for Atlantis: Google Places is not configured" }
  test('Uncached city without Places configured', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/activities').query({ city: 'Atlantis' }).set(authorization);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'No activities are available for Atlantis: Google Places is not configured' });
    expect(await ActivityModel.countDocuments()).toBe(0);
  });

  // Input: no city query parameter
  // Expected status code: 400
  // Expected behavior: request is rejected before any lookup
  // Expected output: { error: "Invalid request", details: [...] }
  test('Missing city', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/activities').set(authorization);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request');
  });

  // Input: city=Vancouver&interest=skydiving (not a supported interest tag)
  // Expected status code: 400
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid request", details: [...] }
  test('Unknown interest', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app)
      .get('/api/activities')
      .query({ city: 'Vancouver', interest: 'skydiving' })
      .set(authorization);

    expect(response.status).toBe(400);
  });

  // Input: city=Vancouver without an Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing session token" }
  test('Not signed in', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/activities').query({ city: 'Vancouver' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing session token' });
  });
});
