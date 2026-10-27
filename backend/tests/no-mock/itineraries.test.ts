import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import { DEMO_VANCOUVER_PLACES } from '../../src/dev/demoVancouverPlaces';
import type { GroupDto } from '../../src/groups/groupService';
import type { ItineraryDto, ItinerarySummaryDto } from '../../src/itineraries/itineraryService';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville } from '../helpers/testville';

// 2026-10-26 is a Monday, when the Museum of Anthropology (demo data) is closed.
const MUSEUM_WEEKEND = {
  city: 'Vancouver',
  startDate: '2026-10-24',
  endDate: '2026-10-26',
  dayStart: '09:00',
  dayEnd: '18:00',
  interests: ['museums'],
  pace: 'moderate',
};

const TESTVILLE_DAY = { city: 'Testville', startDate: '2026-10-24', endDate: '2026-10-24', dayStart: '09:00', dayEnd: '18:00' };

function allStops(itinerary: ItineraryDto): ItineraryDto['days'][number]['stops'] {
  return itinerary.days.flatMap((day) => day.stops);
}

async function testvilleId(name: string): Promise<string> {
  return (await ActivityModel.findOne({ name }))?._id.toString() ?? '';
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface POST /api/itineraries/generate
describe('Unmocked: POST /api/itineraries/generate', () => {
  // Input: a 3-day Vancouver trip (Sat-Mon), 09:00-18:00, interested in museums, moderate pace
  // Expected status code: 201
  // Expected behavior: a day-by-day plan is generated from the cached catalogue and stored
  // Expected output: 3 days of timed stops within 09:00-18:00, no activity twice, no closed venue
  test('Generates and stores a multi-day plan', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send(MUSEUM_WEEKEND);

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(itinerary.days.map((day) => [day.date, day.weekday])).toEqual([
      ['2026-10-24', 6],
      ['2026-10-25', 0],
      ['2026-10-26', 1],
    ]);
    const stops = allStops(itinerary);
    expect(stops.length).toBeGreaterThanOrEqual(6);
    expect(new Set(stops.map((stop) => stop.activityId)).size).toBe(stops.length);
    for (const stop of stops) {
      expect(stop.startTime >= '09:00' && stop.endTime <= '18:00').toBe(true);
    }
    const monday = itinerary.days.at(2)?.stops.map((stop) => stop.name);
    expect(monday).not.toContain('Museum of Anthropology at UBC');
    expect(itinerary.lodging).toMatchObject({ label: 'Vancouver centre', source: 'city-centre' });
    expect(itinerary.warnings).toEqual([]);
    expect(await ItineraryModel.countDocuments()).toBe(1);
  });

  // Input: the same trip with only the required fields (city and dates)
  // Expected status code: 201
  // Expected behavior: defaults are applied: 09:00-18:00, moderate pace, all interests
  // Expected output: an itinerary echoing the defaults
  test('Applies defaults', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app)
      .post('/api/itineraries/generate')
      .set(authorization)
      .send({ city: 'Vancouver', startDate: '2026-10-24', endDate: '2026-10-24' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      dayStart: '09:00',
      dayEnd: '18:00',
      arrivalTime: null,
      departureTime: null,
      pace: 'moderate',
      interests: [],
    });
  });

  // Input: the 3-day trip arriving at 15:00 on the first day and departing at 12:00 on the last
  // Expected status code: 201
  // Expected behavior: the first day is planned from 15:00 and the last day ends (back at the lodging) by 12:00
  // Expected output: arrivalTime/departureTime echoed; first-day stops start at or after 15:00; last-day stops end by 12:00
  test('Respects arrival and departure times', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app)
      .post('/api/itineraries/generate')
      .set(authorization)
      .send({ ...MUSEUM_WEEKEND, arrivalTime: '15:00', departureTime: '12:00' });

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(itinerary).toMatchObject({ arrivalTime: '15:00', departureTime: '12:00' });
    const [firstDay, , lastDay] = itinerary.days;
    expect(firstDay?.stops.length).toBeGreaterThan(0);
    expect(firstDay?.stops.every((stop) => stop.startTime >= '15:00')).toBe(true);
    expect(lastDay?.stops.every((stop) => stop.endTime <= '12:00')).toBe(true);
  });

  // Input: a lodging name on a server without Google Places configured
  // Expected status code: 201
  // Expected behavior: the lodging cannot be looked up, so days start at the city centre and the traveller is told
  // Expected output: lodging.source "city-centre" and a warning naming the lodging
  test('Lodging cannot be looked up', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app)
      .post('/api/itineraries/generate')
      .set(authorization)
      .send({ ...MUSEUM_WEEKEND, lodging: 'Fairmont Hotel Vancouver' });

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(itinerary.lodging.source).toBe('city-centre');
    expect(itinerary.warnings).toEqual(['Could not find "Fairmont Hotel Vancouver"; days start and end at the Vancouver centre.']);
  });

  // Input: a trip to a town whose only activity (a museum open 10:00-17:00) is visited 18:00-21:00
  // Expected status code: 201
  // Expected behavior: an empty plan is stored with a warning rather than failing
  // Expected output: a day with no stops and a warning suggesting longer days
  test('Nothing fits the hours', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    const [museum] = DEMO_VANCOUVER_PLACES.filter((place) => place.placeId === 'demo-museum-of-vancouver');
    await activityService.importPlaces('Tinytown', museum ? [museum] : []);

    const response = await request(app)
      .post('/api/itineraries/generate')
      .set(authorization)
      .send({ city: 'Tinytown', startDate: '2026-10-24', endDate: '2026-10-24', dayStart: '18:00', dayEnd: '21:00' });

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(allStops(itinerary)).toEqual([]);
    expect(itinerary.warnings).toEqual(['No activity fits these dates and hours; try longer days or different interests.']);
  });

  // Input: invalid trips: end before start, longer than 7 days, impossible date, bad time, too-short day,
  //        unknown pace, unknown interest, missing city
  // Expected status code: 400 for each
  // Expected behavior: nothing is generated or stored
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([
    { ...MUSEUM_WEEKEND, startDate: '2026-10-26', endDate: '2026-10-24' },
    { ...MUSEUM_WEEKEND, endDate: '2026-11-06' },
    { ...MUSEUM_WEEKEND, startDate: '2026-02-30' },
    { ...MUSEUM_WEEKEND, dayStart: '9am' },
    { ...MUSEUM_WEEKEND, arrivalTime: '25:00' },
    { ...MUSEUM_WEEKEND, dayStart: '17:00', dayEnd: '18:00' },
    { ...MUSEUM_WEEKEND, pace: 'frantic' },
    { ...MUSEUM_WEEKEND, interests: ['skydiving'] },
    { ...MUSEUM_WEEKEND, city: '' },
  ])('Invalid trip %#', async (invalidTrip) => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send(invalidTrip);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request');
    expect(await ItineraryModel.countDocuments()).toBe(0);
  });

  // Input: a city with no cached catalogue, on a server without Google Places configured
  // Expected status code: 503
  // Expected behavior: nothing is generated
  // Expected output: { error: "No activities are available for Atlantis: Google Places is not configured" }
  test('City without activities available', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send({ ...MUSEUM_WEEKEND, city: 'Atlantis' });

    expect(response.status).toBe(503);
  });

  // Input: a valid trip without an Authorization header
  // Expected status code: 401
  // Expected behavior: nothing is generated
  // Expected output: { error: "Missing session token" }
  test('Not signed in', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/api/itineraries/generate').send(MUSEUM_WEEKEND);

    expect(response.status).toBe(401);
  });

  // Input: a group trip; the owner's group interests are museums, the member's are outdoors and food,
  //        and the member vetoed Stanley Park Seawall (the best-rated outdoor activity)
  // Expected status code: 201
  // Expected behavior: the plan uses every member's interests and leaves out vetoed activities;
  //                    it is stored as the group's, so the other member can open it
  // Expected output: groupId set, interests [museums, outdoors, food], no Stanley Park Seawall; the member's GET returns 200
  test("Plans a group trip from every member's interests and vetoes", async () => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService, 'Trip Owner');
    const member = await signedInUser(authService, 'Group Member');
    await seedVancouver(activityService);
    const seawall = await ActivityModel.findOne({ name: 'Stanley Park Seawall' });
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    await request(app).put(`/api/groups/${group.id}/members/me`).set(owner.authorization).send({ interests: ['museums'] });
    await request(app)
      .put(`/api/groups/${group.id}/members/me`)
      .set(member.authorization)
      .send({ interests: ['outdoors', 'food'], vetoedActivityIds: [seawall?._id.toString()] });

    const response = await request(app)
      .post('/api/itineraries/generate')
      .set(owner.authorization)
      .send({ ...MUSEUM_WEEKEND, interests: ['nightlife'], groupId: group.id });

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(itinerary.groupId).toBe(group.id);
    expect(itinerary.interests).toEqual(['museums', 'outdoors', 'food']);
    expect(allStops(itinerary).length).toBeGreaterThan(0);
    expect(allStops(itinerary).map((stop) => stop.name)).not.toContain('Stanley Park Seawall');
    const memberView = await request(app).get(`/api/itineraries/${itinerary.id}`).set(member.authorization);
    expect(memberView.status).toBe(200);
  });

  // Input: a trip for a group the traveller does not belong to, and a groupId that is not an id
  // Expected status code: 404 and 400
  // Expected behavior: nothing is generated or stored
  // Expected output: { error: "Group not found" }, then { error: "Invalid request", ... }
  test.each([
    ['not a member', 404],
    ['not-an-id', 400],
  ])('Invalid group: %s', async (scenario, status) => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService, 'Trip Owner');
    const stranger = await signedInUser(authService, 'Someone Else');
    await seedVancouver(activityService);
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    const groupId = scenario === 'not a member' ? group.id : scenario;

    const response = await request(app).post('/api/itineraries/generate').set(stranger.authorization).send({ ...MUSEUM_WEEKEND, groupId });

    expect(response.status).toBe(status);
    expect(await ItineraryModel.countDocuments()).toBe(0);
  });

  // Input: a one-day Testville trip on foot with a low budget
  // Expected status code: 201
  // Expected behavior: Town Museum (expensive) is left out; the options are stored with the plan
  // Expected output: transportMode "walk", budget "low", travelTimeSource "estimate", no Town Museum
  test('Plans with a transport mode and a budget', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);

    const response = await request(app)
      .post('/api/itineraries/generate')
      .set(authorization)
      .send({ ...TESTVILLE_DAY, transportMode: 'walk', budget: 'low' });

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(itinerary).toMatchObject({ transportMode: 'walk', budget: 'low', travelTimeSource: 'estimate' });
    expect(allStops(itinerary).length).toBeGreaterThan(0);
    expect(allStops(itinerary).map((stop) => stop.name)).not.toContain('Town Museum');
  });

  // Input: a Testville day until 21:00 that must include Night Market (opens 17:00) and must avoid Harbour Park
  // Expected status code: 201
  // Expected behavior: the must-see is scheduled even though it ranks no higher than the rest; the avoided place is not
  // Expected output: Night Market in the plan, Harbour Park not; both lists echoed
  test('Includes must-see places and leaves out avoided ones', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);
    const market = await testvilleId('Night Market');
    const park = await testvilleId('Harbour Park');

    const response = await request(app)
      .post('/api/itineraries/generate')
      .set(authorization)
      .send({ ...TESTVILLE_DAY, dayEnd: '21:00', mustSeeIds: [market], avoidIds: [park] });

    const itinerary = response.body as ItineraryDto;
    const names = allStops(itinerary).map((stop) => stop.name);
    expect(response.status).toBe(201);
    expect(names).toContain('Night Market');
    expect(names).not.toContain('Harbour Park');
    expect(itinerary).toMatchObject({ mustSeeIds: [market], avoidIds: [park] });
    expect(itinerary.warnings).toEqual([]);
  });

  // Input: must-sees that cannot be included: Night Market on a day ending at 16:00, a place from another city,
  //        and (in a group trip) a place another member vetoed
  // Expected status code: 201 for each
  // Expected behavior: the rest of the plan is generated, and the traveller is told why each must-see is missing
  // Expected output: one warning per missing must-see, with its reason
  test('Explains must-see places it cannot include', async () => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService, 'Trip Owner');
    const member = await signedInUser(authService, 'Group Member');
    await seedTestville(activityService);
    await seedVancouver(activityService);
    const market = await testvilleId('Night Market');
    const lookout = await testvilleId('Lookout Tower');
    const elsewhere = (await ActivityModel.findOne({ name: 'Stanley Park Seawall' }))?._id.toString();
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    await request(app).put(`/api/groups/${group.id}/members/me`).set(member.authorization).send({ vetoedActivityIds: [lookout] });

    const solo = await request(app)
      .post('/api/itineraries/generate')
      .set(owner.authorization)
      .send({ ...TESTVILLE_DAY, dayEnd: '16:00', mustSeeIds: [market, elsewhere] });
    const grouped = await request(app)
      .post('/api/itineraries/generate')
      .set(owner.authorization)
      .send({ ...TESTVILLE_DAY, mustSeeIds: [lookout], groupId: group.id });

    expect(solo.status).toBe(201);
    expect((solo.body as ItineraryDto).warnings).toEqual([
      'Night Market did not fit your days: check its opening hours.',
      "One of your must-see places is not in this city's activities.",
    ]);
    expect(grouped.status).toBe(201);
    expect((grouped.body as ItineraryDto).warnings).toEqual(['Lookout Tower was vetoed by a member of the group, so it was left out.']);
  });

  // Input: an unknown transport mode, an unknown budget, a place both must-see and avoided, and 11 must-sees
  // Expected status code: 400 for each
  // Expected behavior: nothing is generated
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([
    { transportMode: 'teleport' },
    { budget: 'luxury' },
    { mustSeeIds: ['64b7f0c2a1b2c3d4e5f60718'], avoidIds: ['64b7f0c2a1b2c3d4e5f60718'] },
    { mustSeeIds: Array.from({ length: 11 }, (_, index) => `64b7f0c2a1b2c3d4e5f607${String(10 + index)}`) },
  ])('Invalid trip options %#', async (options) => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedTestville(activityService);

    const response = await request(app).post('/api/itineraries/generate').set(authorization).send({ ...TESTVILLE_DAY, ...options });

    expect(response.status).toBe(400);
    expect(await ItineraryModel.countDocuments()).toBe(0);
  });
});

// Interface GET /api/itineraries/:itineraryId
describe('Unmocked: GET /api/itineraries/:itineraryId', () => {
  // Input: the id of an itinerary the signed-in traveller generated
  // Expected status code: 200
  // Expected behavior: the stored itinerary is read back unchanged
  // Expected output: the same itinerary the generate call returned
  test('Own itinerary', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const generated = await request(app).post('/api/itineraries/generate').set(authorization).send(MUSEUM_WEEKEND);

    const response = await request(app).get(`/api/itineraries/${(generated.body as ItineraryDto).id}`).set(authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(generated.body);
  });

  // Input: the id of an itinerary another traveller generated
  // Expected status code: 404
  // Expected behavior: other travellers' plans are not revealed
  // Expected output: { error: "Itinerary not found" }
  test("Another traveller's itinerary", async () => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService, 'Trip Owner');
    const stranger = await signedInUser(authService, 'Someone Else');
    await seedVancouver(activityService);
    const generated = await request(app).post('/api/itineraries/generate').set(owner.authorization).send(MUSEUM_WEEKEND);

    const response = await request(app).get(`/api/itineraries/${(generated.body as ItineraryDto).id}`).set(stranger.authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Itinerary not found' });
  });

  // Input: an id that is not a valid id, and a valid id that matches no itinerary
  // Expected status code: 404 for both
  // Expected behavior: nothing is returned
  // Expected output: { error: "Itinerary not found" }
  test.each(['not-an-id', '64b7f0c2a1b2c3d4e5f60718'])('Unknown itinerary %s', async (itineraryId) => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get(`/api/itineraries/${itineraryId}`).set(authorization);

    expect(response.status).toBe(404);
  });
});

// Interface GET /api/itineraries
describe('Unmocked: GET /api/itineraries', () => {
  // Input: a traveller who generated two itineraries, while another traveller generated one
  // Expected status code: 200
  // Expected behavior: only the traveller's own itineraries are listed, newest first
  // Expected output: { itineraries: [summary of the second, summary of the first] }
  test("Lists the traveller's itineraries, newest first", async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService, 'Trip Owner');
    const stranger = await signedInUser(authService, 'Someone Else');
    await seedVancouver(activityService);
    await request(app).post('/api/itineraries/generate').set(authorization).send({ ...MUSEUM_WEEKEND, pace: 'relaxed' });
    await request(app).post('/api/itineraries/generate').set(authorization).send({ ...MUSEUM_WEEKEND, pace: 'packed' });
    await request(app).post('/api/itineraries/generate').set(stranger.authorization).send(MUSEUM_WEEKEND);

    const response = await request(app).get('/api/itineraries').set(authorization);

    const summaries = (response.body as { itineraries: ItinerarySummaryDto[] }).itineraries;
    expect(response.status).toBe(200);
    expect(summaries.map((summary) => summary.pace)).toEqual(['packed', 'relaxed']);
    expect(summaries.at(0)).toMatchObject({ city: 'Vancouver', startDate: '2026-10-24', endDate: '2026-10-26' });
    expect(summaries.at(0)?.stopCount).toBeGreaterThan(summaries.at(1)?.stopCount ?? 0);
  });

  // Input: a traveller who has not generated anything
  // Expected status code: 200
  // Expected behavior: nothing is listed
  // Expected output: { itineraries: [] }
  test('No itineraries yet', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/itineraries').set(authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ itineraries: [] });
  });

  // Input: the owner has a personal trip and a group trip; a member of the group lists theirs, then filters by the group
  // Expected status code: 200 for both
  // Expected behavior: the member sees the group's trip but not the owner's personal one
  // Expected output: one summary with groupId set, both times
  test("Lists the traveller's group trips", async () => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService, 'Trip Owner');
    const member = await signedInUser(authService, 'Group Member');
    await seedVancouver(activityService);
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    await request(app).post('/api/itineraries/generate').set(owner.authorization).send(MUSEUM_WEEKEND);
    await request(app).post('/api/itineraries/generate').set(owner.authorization).send({ ...MUSEUM_WEEKEND, groupId: group.id });

    const all = await request(app).get('/api/itineraries').set(member.authorization);
    const filtered = await request(app).get('/api/itineraries').query({ groupId: group.id }).set(member.authorization);

    for (const response of [all, filtered]) {
      const summaries = (response.body as { itineraries: ItinerarySummaryDto[] }).itineraries;
      expect(response.status).toBe(200);
      expect(summaries.map((summary) => summary.groupId)).toEqual([group.id]);
    }
  });

  // Input: a filter by a group the traveller is not in, and a filter that is not an id
  // Expected status code: 404 and 400
  // Expected behavior: the group's trips are not revealed
  // Expected output: { error: "Group not found" }, then { error: "Invalid request", ... }
  test.each([
    ['not a member', 404],
    ['not-an-id', 400],
  ])('Invalid group filter: %s', async (scenario, status) => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Trip Owner');
    const stranger = await signedInUser(authService, 'Someone Else');
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    const groupId = scenario === 'not a member' ? group.id : scenario;

    const response = await request(app).get('/api/itineraries').query({ groupId }).set(stranger.authorization);

    expect(response.status).toBe(status);
  });
});
