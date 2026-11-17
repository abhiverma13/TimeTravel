import request from 'supertest';

import type { GroupDto } from '../../src/groups/groupService';
import type { TripDto, TripSummaryDto } from '../../src/trips/tripService';
import { TripModel } from '../../src/trips/tripModel';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

const TRIP = { city: 'Vancouver', startDate: '2026-10-24', endDate: '2026-10-25', interests: ['museums'], pace: 'moderate' };

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface DELETE /api/trips/:tripId
describe('Unmocked: DELETE /api/trips/:tripId', () => {
  // Input: the id of a personal trip the signed-in traveller planned
  // Expected status code: 204
  // Expected behavior: the trip is deleted, so it can no longer be opened or listed
  // Expected output: an empty body; then 404 for the trip and { trips: [] } for the list
  test('Own trip', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const trip = (await request(app).post('/api/trips/generate').set(authorization).send(TRIP)).body as TripDto;

    const response = await request(app).delete(`/api/trips/${trip.id}`).set(authorization);

    expect(response.status).toBe(204);
    expect((await request(app).get(`/api/trips/${trip.id}`).set(authorization)).status).toBe(404);
    expect((await request(app).get('/api/trips').set(authorization)).body).toEqual({ trips: [] });
  });

  // Input: a group trip; first a member who did not plan it deletes it, then its planner does
  // Expected status code: 403 for the member, then 204 for the planner
  // Expected behavior: only the planner may delete it (the list marks it as theirs), and then it is gone for every member
  // Expected output: { error: "Only the traveller who planned this trip can delete it" }, then an empty body
  test('Group trip', async () => {
    const { app, authService, activityService } = createTestApp();
    const planner = await signedInUser(authService, 'Trip Planner');
    const member = await signedInUser(authService, 'Group Member');
    await seedVancouver(activityService);
    const group = (await request(app).post('/api/groups').set(planner.authorization).send({ name: 'Crew' })).body as GroupDto;
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    const trip = (await request(app).post('/api/trips/generate').set(planner.authorization).send({ ...TRIP, groupId: group.id })).body as TripDto;
    const plannerList = (await request(app).get('/api/trips').set(planner.authorization)).body as { trips: TripSummaryDto[] };
    const memberList = (await request(app).get('/api/trips').set(member.authorization)).body as { trips: TripSummaryDto[] };

    const refused = await request(app).delete(`/api/trips/${trip.id}`).set(member.authorization);
    const deleted = await request(app).delete(`/api/trips/${trip.id}`).set(planner.authorization);

    expect(plannerList.trips.map((summary) => summary.mine)).toEqual([true]);
    expect(memberList.trips.map((summary) => summary.mine)).toEqual([false]);
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ error: 'Only the traveller who planned this trip can delete it' });
    expect(deleted.status).toBe(204);
    expect((await request(app).get('/api/trips').set(member.authorization)).body).toEqual({ trips: [] });
  });

  // Input: another traveller's personal trip, an id that is not a valid id, and a valid id that matches no trip
  // Expected status code: 404 for each
  // Expected behavior: nothing is deleted, and other travellers' trips are not revealed
  // Expected output: { error: "Trip not found" }
  test.each(['stranger', 'not-an-id', '64b7f0c2a1b2c3d4e5f60718'])('Trip not found: %s', async (scenario) => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService, 'Trip Owner');
    const stranger = await signedInUser(authService, 'Someone Else');
    await seedVancouver(activityService);
    const trip = (await request(app).post('/api/trips/generate').set(owner.authorization).send(TRIP)).body as TripDto;
    const tripId = scenario === 'stranger' ? trip.id : scenario;

    const response = await request(app).delete(`/api/trips/${tripId}`).set(stranger.authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Trip not found' });
    expect(await TripModel.countDocuments()).toBe(1);
  });
});
