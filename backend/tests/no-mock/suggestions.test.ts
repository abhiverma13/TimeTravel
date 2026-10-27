import { Types } from 'mongoose';
import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import type { SuggestionDto } from '../../src/disruptions/disruptionService';
import { SuggestionModel } from '../../src/disruptions/suggestionModel';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

/**
 * Pia's one-day Testville trip (Saturday 2026-10-24) with a rain suggestion for Harbour Park, made by the Trip Sync &
 * Disruption Service itself; the server clock is that morning.
 */
async function rainyTrip() {
  const { app, authService, activityService, disruptionService } = createTestApp({ now: () => new Date('2026-10-24T08:00:00Z') });
  await seedTestville(activityService);
  const pia = await signedInUser(authService, 'Pia Planner');
  const outsider = await signedInUser(authService, 'Oscar Outsider');
  const itineraryId = await storeTestvilleTrip(pia.userId, ['Morning Bakery', 'Harbour Park', 'Town Museum']);
  const parkId = (await ActivityModel.findOne({ name: 'Harbour Park' }))?._id.toString() ?? '';
  await disruptionService.suggest(new Types.ObjectId(itineraryId), 0, parkId, 'rain');
  const list = async (user = pia) =>
    request(app).get(`/api/suggestions?itineraryId=${itineraryId}`).set(user.authorization);
  const [suggestion] = ((await list()).body as { suggestions: SuggestionDto[] }).suggestions;
  return { app, pia, outsider, itineraryId, parkId, suggestion: suggestion ?? fail('no suggestion was made'), list };
}

function fail(message: string): never {
  throw new Error(message);
}

function suggestionsIn(response: request.Response): SuggestionDto[] {
  return (response.body as { suggestions: SuggestionDto[] }).suggestions;
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface GET /api/suggestions
describe('Unmocked: GET /api/suggestions', () => {
  // Input: Pia's trip, which has a rain suggestion for Harbour Park
  // Expected status code: 200
  // Expected behavior: the waiting suggestion is listed, with the day as it would be
  // Expected output: one suggestion swapping Harbour Park for an indoor activity (Lookout Tower)
  test("Lists the trip's waiting suggestions", async () => {
    const { list, parkId } = await rainyTrip();

    const response = await list();

    const [suggestion] = suggestionsIn(response);
    expect(response.status).toBe(200);
    expect(suggestion).toMatchObject({
      dayIndex: 0,
      date: '2026-10-24',
      activityId: parkId,
      activityName: 'Harbour Park',
      reason: 'rain',
      message: 'Rain is likely at 10:00 during Harbour Park. Swap it for Lookout Tower?',
    });
    expect(suggestion?.proposedStops).toContain('Lookout Tower');
    expect(suggestion?.proposedStops).not.toContain('Harbour Park');
  });

  // Input: the trip after Pia locks a stop, and the trip after the suggestion's time ran out
  // Expected status code: 200 for both
  // Expected behavior: a suggestion worked out for an older version of the trip, or past its time, is not shown
  // Expected output: { suggestions: [] } for both
  test.each(['the trip changed', 'the suggestion expired'])('Not listed once %s', async (scenario) => {
    const { app, pia, itineraryId, list, suggestion } = await rainyTrip();
    if (scenario === 'the trip changed') {
      const trip = (await request(app).get(`/api/itineraries/${itineraryId}`).set(pia.authorization)).body as ItineraryDto;
      await request(app)
        .post(`/api/itineraries/${itineraryId}/adjust`)
        .set(pia.authorization)
        .send({ action: 'lock', version: 0, dayIndex: 0, activityId: trip.days.at(0)?.stops.at(0)?.activityId });
    } else {
      await SuggestionModel.updateOne({ _id: suggestion.id }, { $set: { expiresAt: new Date('2026-10-24T07:00:00Z') } });
    }

    const response = await list();

    expect(response.status).toBe(200);
    expect(suggestionsIn(response)).toEqual([]);
  });

  // Input: a traveller who cannot see the trip, and no itinerary id
  // Expected status code: 404 and 400
  // Expected behavior: nothing is revealed
  // Expected output: { error: "Itinerary not found" }, then { error: "Invalid request", details: [...] }
  test('Suggestions of a trip you cannot see', async () => {
    const { app, outsider, list } = await rainyTrip();

    const hidden = await list(outsider);
    const missing = await request(app).get('/api/suggestions').set(outsider.authorization);

    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual({ error: 'Itinerary not found' });
    expect(missing.status).toBe(400);
  });
});

// Interface POST /api/suggestions/:suggestionId/accept
describe('Unmocked: POST /api/suggestions/:suggestionId/accept', () => {
  // Input: Pia accepts the rain suggestion
  // Expected status code: 200
  // Expected behavior: the proposed day is saved as a new version of the trip, and the suggestion is answered
  // Expected output: the itinerary with Lookout Tower instead of Harbour Park, version 1; no suggestions left
  test('Accepting applies the proposed day', async () => {
    const { app, pia, list, suggestion } = await rainyTrip();

    const response = await request(app).post(`/api/suggestions/${suggestion.id}/accept`).set(pia.authorization);

    const itinerary = response.body as ItineraryDto;
    const names = itinerary.days.at(0)?.stops.map((stop) => stop.name);
    expect(response.status).toBe(200);
    expect(itinerary.version).toBe(1);
    expect(names).toContain('Lookout Tower');
    expect(names).not.toContain('Harbour Park');
    expect((await SuggestionModel.findById(suggestion.id))?.status).toBe('accepted');
    expect(suggestionsIn(await list())).toEqual([]);
  });

  // Input: Pia locks a stop (the trip is now version 1), then accepts the suggestion made for version 0
  // Expected status code: 409
  // Expected behavior: the old proposal is not applied over the newer trip, and the suggestion lapses
  // Expected output: { error: "The trip changed since this suggestion; it no longer applies" }
  test('Accepting after the trip changed', async () => {
    const { app, pia, itineraryId, suggestion } = await rainyTrip();
    const trip = (await request(app).get(`/api/itineraries/${itineraryId}`).set(pia.authorization)).body as ItineraryDto;
    await request(app)
      .post(`/api/itineraries/${itineraryId}/adjust`)
      .set(pia.authorization)
      .send({ action: 'lock', version: 0, dayIndex: 0, activityId: trip.days.at(0)?.stops.at(0)?.activityId });

    const response = await request(app).post(`/api/suggestions/${suggestion.id}/accept`).set(pia.authorization);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'The trip changed since this suggestion; it no longer applies' });
    expect((await SuggestionModel.findById(suggestion.id))?.status).toBe('expired');
  });

  // Input: accepting twice, accepting after the suggestion's time ran out, a traveller who cannot see the trip, and an
  //        id that is not an id
  // Expected status code: 200 then 409, 409, 404 and 404
  // Expected behavior: a suggestion is answered once, in time, by someone in the trip
  // Expected output: the matching error
  test('Accepts that are refused', async () => {
    const first = await rainyTrip();
    await request(first.app).post(`/api/suggestions/${first.suggestion.id}/accept`).set(first.pia.authorization);
    const twice = await request(first.app).post(`/api/suggestions/${first.suggestion.id}/accept`).set(first.pia.authorization);
    await clearTestDatabase();
    const second = await rainyTrip();
    const outsider = await request(second.app).post(`/api/suggestions/${second.suggestion.id}/accept`).set(second.outsider.authorization);
    const malformed = await request(second.app).post('/api/suggestions/not-an-id/accept').set(second.pia.authorization);
    await SuggestionModel.updateOne({ _id: second.suggestion.id }, { $set: { expiresAt: new Date('2026-10-24T07:00:00Z') } });
    const expired = await request(second.app).post(`/api/suggestions/${second.suggestion.id}/accept`).set(second.pia.authorization);

    expect([twice.status, expired.status, outsider.status, malformed.status]).toEqual([409, 409, 404, 404]);
    expect(twice.body).toEqual({ error: 'This suggestion was already answered' });
    expect(expired.body).toEqual({ error: 'This suggestion has expired' });
    expect(outsider.body).toEqual({ error: 'Suggestion not found' });
  });
});

// Interface POST /api/suggestions/:suggestionId/dismiss
describe('Unmocked: POST /api/suggestions/:suggestionId/dismiss', () => {
  // Input: Pia dismisses the rain suggestion, then dismisses it again
  // Expected status code: 204, then 409
  // Expected behavior: the trip stays as it is and the suggestion is no longer listed
  // Expected output: no body; version 0 with Harbour Park; then { error: "This suggestion was already answered" }
  test('Dismissing leaves the trip as it is', async () => {
    const { app, pia, itineraryId, list, suggestion } = await rainyTrip();

    const response = await request(app).post(`/api/suggestions/${suggestion.id}/dismiss`).set(pia.authorization);
    const again = await request(app).post(`/api/suggestions/${suggestion.id}/dismiss`).set(pia.authorization);

    const trip = (await request(app).get(`/api/itineraries/${itineraryId}`).set(pia.authorization)).body as ItineraryDto;
    expect(response.status).toBe(204);
    expect(trip.version).toBe(0);
    expect(trip.days.at(0)?.stops.map((stop) => stop.name)).toContain('Harbour Park');
    expect(suggestionsIn(await list())).toEqual([]);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'This suggestion was already answered' });
  });
});

// Interface Disruption timer: checkActiveTrips()
describe('Unmocked: Disruption timer: checkActiveTrips()', () => {
  // Input: the timer runs on Saturday morning with no forecast or venue-status service set up (no keys)
  // Expected status code: none (timer)
  // Expected behavior: there is nothing to check against, so the trip is left alone
  // Expected output: 0 suggestions made
  test('Without the forecast and venue services nothing is suggested', async () => {
    const { app, authService, activityService, disruptionService } = createTestApp({ now: () => new Date('2026-10-24T08:00:00Z') });
    await seedTestville(activityService);
    const { userId, authorization } = await signedInUser(authService, 'Pia Planner');
    const itineraryId = await storeTestvilleTrip(userId, ['Morning Bakery', 'Harbour Park']);

    const made = await disruptionService.checkActiveTrips();

    expect(made).toBe(0);
    expect(suggestionsIn(await request(app).get(`/api/suggestions?itineraryId=${itineraryId}`).set(authorization))).toEqual([]);
  });
});
