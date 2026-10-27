import request from 'supertest';

import type { GroupDto } from '../../src/groups/groupService';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import { JoinRequestModel } from '../../src/nearby/joinRequestModel';
import type { JoinRequestDto, NearbyTripDto } from '../../src/nearby/nearbyService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

type Traveller = Awaited<ReturnType<typeof signedInUser>>;

// Two days before the Testville trip (Saturday 2026-10-24), so it starts within the next 7 days.
const TWO_DAYS_BEFORE = new Date('2026-10-22T12:00:00Z');
// Next to Testville's places.
const IN_TESTVILLE = 'lat=49.281&lng=-123.119';

/**
 * A group (Olivia owns it, Max is a member) with a Testville trip, and Vera and Wes, travellers nearby who are not in it.
 * `now` is the server's clock.
 */
async function openTrip(now: Date = TWO_DAYS_BEFORE) {
  const { app, authService, activityService } = createTestApp({ now: () => now });
  await seedTestville(activityService);
  const olivia = await signedInUser(authService, 'Olivia Owner');
  const max = await signedInUser(authService, 'Max Member');
  const vera = await signedInUser(authService, 'Vera Visitor');
  const wes = await signedInUser(authService, 'Wes Wanderer');
  const client = (user: Traveller) => ({
    get: (path: string) => request(app).get(path).set(user.authorization),
    post: (path: string, body: object = {}) => request(app).post(path).set(user.authorization).send(body),
    put: (path: string, body: object) => request(app).put(path).set(user.authorization).send(body),
  });
  const group = (await client(olivia).post('/api/groups', { name: 'Testville crew' })).body as GroupDto;
  await client(max).post('/api/groups/join', { inviteCode: group.inviteCode });
  const itineraryId = await storeTestvilleTrip(olivia.userId, ['Morning Bakery', 'Harbour Park', 'Town Museum'], { groupId: group.id });
  const open = async () => client(olivia).put(`/api/nearby/trips/${itineraryId}`, { openToJoin: true });
  const ask = async (user: Traveller, note = 'Hi! Mind if I join?') =>
    (await client(user).post(`/api/nearby/trips/${itineraryId}/requests`, { note })).body as JoinRequestDto;
  return { app, olivia, max, vera, wes, client, group, itineraryId, open, ask };
}

function trips(response: request.Response): NearbyTripDto[] {
  return (response.body as { trips: NearbyTripDto[] }).trips;
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface PUT /api/nearby/trips/:itineraryId
describe('Unmocked: PUT /api/nearby/trips/:itineraryId', () => {
  // Input: the group's owner sends { openToJoin: true }, then { openToJoin: false }
  // Expected status code: 200 for both
  // Expected behavior: the trip is opened to travellers nearby, then closed again
  // Expected output: { openToJoin: true } (and the itinerary says so), then { openToJoin: false }
  test('The group owner opens a trip and closes it again', async () => {
    const { olivia, client, itineraryId, open } = await openTrip();

    const opened = await open();
    const itinerary = (await client(olivia).get(`/api/itineraries/${itineraryId}`)).body as ItineraryDto;
    const closed = await client(olivia).put(`/api/nearby/trips/${itineraryId}`, { openToJoin: false });

    expect(opened.status).toBe(200);
    expect(opened.body).toEqual({ openToJoin: true });
    expect(itinerary.openToJoin).toBe(true);
    expect(closed.body).toEqual({ openToJoin: false });
  });

  // Input: a member who is not the owner, a traveller outside the group, a personal trip's owner, someone else's personal
  //        trip, and an id that is not an id
  // Expected status code: 403, 404, 409, 404 and 404
  // Expected behavior: the trip stays closed
  // Expected output: the matching error
  test('Who may not open a trip', async () => {
    const { max, vera, client, itineraryId } = await openTrip();
    const personal = await storeTestvilleTrip(vera.userId, ['Harbour Park']);

    const responses = await Promise.all([
      client(max).put(`/api/nearby/trips/${itineraryId}`, { openToJoin: true }),
      client(vera).put(`/api/nearby/trips/${itineraryId}`, { openToJoin: true }),
      client(vera).put(`/api/nearby/trips/${personal}`, { openToJoin: true }),
      client(max).put(`/api/nearby/trips/${personal}`, { openToJoin: true }),
      client(max).put('/api/nearby/trips/not-an-id', { openToJoin: true }),
    ]);

    expect(responses.map((response) => [response.status, (response.body as { error: string }).error])).toEqual([
      [403, 'Only the group owner can open this trip to travellers nearby'],
      [404, 'Itinerary not found'],
      [409, 'Only group trips can be opened to travellers nearby'],
      [404, 'Itinerary not found'],
      [404, 'Itinerary not found'],
    ]);
  });

  // Input: an empty body, and openToJoin "yes"
  // Expected status code: 400 for both
  // Expected behavior: nothing changes
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([{}, { openToJoin: 'yes' }])('Invalid body %p', async (body) => {
    const { olivia, client, itineraryId } = await openTrip();

    const response = await client(olivia).put(`/api/nearby/trips/${itineraryId}`, body);

    expect(response.status).toBe(400);
  });
});

// Interface GET /api/nearby/trips
describe('Unmocked: GET /api/nearby/trips', () => {
  // Input: Vera, standing next to Testville's places, after Olivia opened her group's trip
  // Expected status code: 200
  // Expected behavior: the open trip is listed with what Vera needs to decide, but never its lodging or anyone's position
  // Expected output: the trip with its group, organizer, member count, dates, stops, distance and myRequest "none"
  test('Lists open trips nearby', async () => {
    const { vera, client, group, itineraryId, open } = await openTrip();
    await open();

    const response = await client(vera).get(`/api/nearby/trips?${IN_TESTVILLE}`);

    const [trip] = trips(response);
    expect(response.status).toBe(200);
    expect(trip).toMatchObject({
      itineraryId,
      groupId: group.id,
      groupName: 'Testville crew',
      organizer: 'Olivia Owner',
      memberCount: 2,
      city: 'Testville',
      startDate: '2026-10-24',
      endDate: '2026-10-24',
      stopNames: ['Morning Bakery', 'Harbour Park', 'Town Museum'],
      myRequest: 'none',
    });
    expect(trip?.distanceKm).toBeLessThan(1);
    expect(Object.keys(trip ?? {})).not.toContain('lodging');
  });

  // Input: the trip closed; Vera 50 km away; the trip already over (server date 2026-10-25); the trip more than 7 days
  //        ahead (server date 2026-10-10); and Max, who is in the trip's group
  // Expected status code: 200 for each
  // Expected behavior: only open trips nearby, soon, and not the caller's own are listed
  // Expected output: no trips in each case
  test.each([
    ['closed', TWO_DAYS_BEFORE, 'vera', IN_TESTVILLE, false],
    ['far away', TWO_DAYS_BEFORE, 'vera', 'lat=49.73&lng=-123.12', true],
    ['already over', new Date('2026-10-25T12:00:00Z'), 'vera', IN_TESTVILLE, true],
    ['too far ahead', new Date('2026-10-10T12:00:00Z'), 'vera', IN_TESTVILLE, true],
    ["the caller's own group", TWO_DAYS_BEFORE, 'max', IN_TESTVILLE, true],
  ] as const)('Not listed: %s', async (_scenario, now, who, where, opened) => {
    const setup = await openTrip(now);
    if (opened) {
      await setup.open();
    }

    const response = await setup.client(who === 'max' ? setup.max : setup.vera).get(`/api/nearby/trips?${where}`);

    expect(response.status).toBe(200);
    expect(trips(response)).toEqual([]);
  });

  // Input: no position, and a latitude of 91
  // Expected status code: 400 for both
  // Expected behavior: nothing is searched
  // Expected output: { error: "Invalid request", details: [...] }
  test.each(['', '?lat=91&lng=-123.12'])('Invalid position %p', async (query) => {
    const { vera, client } = await openTrip();

    const response = await client(vera).get(`/api/nearby/trips${query}`);

    expect(response.status).toBe(400);
  });
});

// Interface POST /api/nearby/trips/:itineraryId/requests
describe('Unmocked: POST /api/nearby/trips/:itineraryId/requests', () => {
  // Input: Vera asks to join the open trip with the note "  Hi! Mind if I join?  "
  // Expected status code: 201
  // Expected behavior: a pending request is saved, and the nearby list shows it
  // Expected output: the request from Vera with the trimmed note; myRequest "pending" for the trip
  test('Asks to join with a note', async () => {
    const { vera, client, group, itineraryId, open } = await openTrip();
    await open();

    const response = await client(vera).post(`/api/nearby/trips/${itineraryId}/requests`, { note: '  Hi! Mind if I join?  ' });
    const nearby = await client(vera).get(`/api/nearby/trips?${IN_TESTVILLE}`);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      itineraryId,
      groupId: group.id,
      requester: { id: vera.userId, name: 'Vera Visitor' },
      note: 'Hi! Mind if I join?',
      status: 'pending',
    });
    expect(trips(nearby).at(0)?.myRequest).toBe('pending');
  });

  // Input: a request to a closed trip, from a member of its group, a second request while one is pending, a 201-character
  //        note, and an itinerary id that is not an id
  // Expected status code: 404, 409, 409, 400 and 404
  // Expected behavior: no new request is saved
  // Expected output: the matching error
  test('Requests that are refused', async () => {
    const { max, vera, client, itineraryId, open, ask } = await openTrip();
    const closed = await client(vera).post(`/api/nearby/trips/${itineraryId}/requests`);
    await open();
    await ask(vera);

    const responses = [
      closed,
      await client(max).post(`/api/nearby/trips/${itineraryId}/requests`),
      await client(vera).post(`/api/nearby/trips/${itineraryId}/requests`),
      await client(vera).post(`/api/nearby/trips/${itineraryId}/requests`, { note: 'x'.repeat(201) }),
      await client(vera).post('/api/nearby/trips/not-an-id/requests'),
    ];

    expect(responses.map((response) => response.status)).toEqual([404, 409, 409, 400, 404]);
    expect(responses.slice(0, 3).map((response) => (response.body as { error: string }).error)).toEqual([
      'This trip is not open to join',
      "You are already in this trip's group",
      'You already asked to join this trip',
    ]);
    expect(await JoinRequestModel.countDocuments()).toBe(1);
  });
});

// Interface GET /api/nearby/requests
describe('Unmocked: GET /api/nearby/requests', () => {
  // Input: Vera, then Wes, ask to join; Olivia lists her group's requests
  // Expected status code: 200
  // Expected behavior: pending requests, oldest first
  // Expected output: Vera's request, then Wes's
  test("The owner sees the group's pending requests", async () => {
    const { olivia, vera, wes, client, group, open, ask } = await openTrip();
    await open();
    await ask(vera);
    await ask(wes, 'Travelling solo this weekend');

    const response = await client(olivia).get(`/api/nearby/requests?groupId=${group.id}`);

    const { requests } = response.body as { requests: JoinRequestDto[] };
    expect(response.status).toBe(200);
    expect(requests.map((joinRequest) => [joinRequest.requester.name, joinRequest.note])).toEqual([
      ['Vera Visitor', 'Hi! Mind if I join?'],
      ['Wes Wanderer', 'Travelling solo this weekend'],
    ]);
  });

  // Input: a member who is not the owner, a traveller outside the group, and a group id that is not an id
  // Expected status code: 403, 404 and 400
  // Expected behavior: nothing is revealed
  // Expected output: the matching error
  test('Who may not see requests', async () => {
    const { max, vera, client, group } = await openTrip();

    const member = await client(max).get(`/api/nearby/requests?groupId=${group.id}`);
    const outsider = await client(vera).get(`/api/nearby/requests?groupId=${group.id}`);
    const malformed = await client(max).get('/api/nearby/requests?groupId=not-an-id');

    expect(member.status).toBe(403);
    expect(member.body).toEqual({ error: 'Only the group owner sees join requests' });
    expect(outsider.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});

// Interface POST /api/nearby/requests/:requestId/accept
describe('Unmocked: POST /api/nearby/requests/:requestId/accept', () => {
  // Input: Olivia accepts Vera's request
  // Expected status code: 200
  // Expected behavior: Vera joins the group (and so sees its trip); the trip leaves her nearby list, being her own now
  // Expected output: the request with status "accepted"
  test('Accepting adds the traveller to the group', async () => {
    const { olivia, vera, client, group, itineraryId, open, ask } = await openTrip();
    await open();
    const joinRequest = await ask(vera);

    const response = await client(olivia).post(`/api/nearby/requests/${joinRequest.id}/accept`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: joinRequest.id, status: 'accepted' });
    expect((await client(vera).get(`/api/groups/${group.id}`)).status).toBe(200);
    expect((await client(vera).get(`/api/itineraries/${itineraryId}`)).status).toBe(200);
    expect(trips(await client(vera).get(`/api/nearby/trips?${IN_TESTVILLE}`))).toEqual([]);
  });

  // Input: Vera asks to join, then joins with the invite code before Olivia accepts
  // Expected status code: 200
  // Expected behavior: the request is accepted without adding Vera twice
  // Expected output: status "accepted"; the group has 3 members
  test('Accepting someone who already joined', async () => {
    const { olivia, vera, client, group, open, ask } = await openTrip();
    await open();
    const joinRequest = await ask(vera);
    await client(vera).post('/api/groups/join', { inviteCode: group.inviteCode });

    const response = await client(olivia).post(`/api/nearby/requests/${joinRequest.id}/accept`);

    expect(response.body).toMatchObject({ status: 'accepted' });
    expect(((await client(olivia).get(`/api/groups/${group.id}`)).body as GroupDto).members).toHaveLength(3);
  });

  // Input: Max (a member) accepts, Wes (outside the group) accepts, Olivia accepts twice, and a request id that is not an id
  // Expected status code: 403, 404, 200 then 409, and 404
  // Expected behavior: only the owner answers, and only once
  // Expected output: the matching error
  test('Who may not accept, and accepting twice', async () => {
    const { olivia, max, vera, wes, client, open, ask } = await openTrip();
    await open();
    const joinRequest = await ask(vera);

    const member = await client(max).post(`/api/nearby/requests/${joinRequest.id}/accept`);
    const outsider = await client(wes).post(`/api/nearby/requests/${joinRequest.id}/accept`);
    await client(olivia).post(`/api/nearby/requests/${joinRequest.id}/accept`);
    const again = await client(olivia).post(`/api/nearby/requests/${joinRequest.id}/accept`);
    const malformed = await client(olivia).post('/api/nearby/requests/not-an-id/accept');

    expect([member.status, outsider.status, again.status, malformed.status]).toEqual([403, 404, 409, 404]);
    expect(member.body).toEqual({ error: 'Only the group owner can answer join requests' });
    expect(outsider.body).toEqual({ error: 'Join request not found' });
    expect(again.body).toEqual({ error: 'This request was already answered' });
  });
});

// Interface POST /api/nearby/requests/:requestId/decline
describe('Unmocked: POST /api/nearby/requests/:requestId/decline', () => {
  // Input: Olivia declines Vera's request; Vera then asks again
  // Expected status code: 200, then 201
  // Expected behavior: Vera stays out of the group and sees the answer; she may ask again later
  // Expected output: status "declined"; myRequest "declined"; then a new pending request
  test('Declining keeps the traveller out', async () => {
    const { olivia, vera, client, group, itineraryId, open, ask } = await openTrip();
    await open();
    const joinRequest = await ask(vera);

    const response = await client(olivia).post(`/api/nearby/requests/${joinRequest.id}/decline`);
    const nearby = await client(vera).get(`/api/nearby/trips?${IN_TESTVILLE}`);
    const again = await client(vera).post(`/api/nearby/trips/${itineraryId}/requests`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'declined' });
    expect((await client(vera).get(`/api/groups/${group.id}`)).status).toBe(404);
    expect(trips(nearby).at(0)?.myRequest).toBe('declined');
    expect(again.status).toBe(201);
  });
});
