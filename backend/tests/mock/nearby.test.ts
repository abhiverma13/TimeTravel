import request from 'supertest';

import { GroupModel } from '../../src/groups/groupModel';
import type { GroupDto } from '../../src/groups/groupService';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import { JoinRequestModel } from '../../src/nearby/joinRequestModel';
import type { JoinRequestDto, NearbyTripDto } from '../../src/nearby/nearbyService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

const IN_TESTVILLE = 'lat=49.281&lng=-123.119';

function simulatedOutage(): never {
  throw new Error('Simulated database outage');
}

// Olivia's group trip in Testville, opened to travellers nearby, and Vera nearby; server errors stay out of the output.
async function openTrip() {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const { app, authService, activityService } = createTestApp({ now: () => new Date('2026-10-22T12:00:00Z') });
  await seedTestville(activityService);
  const olivia = await signedInUser(authService, 'Olivia Owner');
  const vera = await signedInUser(authService, 'Vera Visitor');
  const group = (await request(app).post('/api/groups').set(olivia.authorization).send({ name: 'Testville crew' })).body as GroupDto;
  const itineraryId = await storeTestvilleTrip(olivia.userId, ['Harbour Park'], { groupId: group.id });
  await request(app).put(`/api/nearby/trips/${itineraryId}`).set(olivia.authorization).send({ openToJoin: true });
  const ask = async () =>
    (await request(app).post(`/api/nearby/trips/${itineraryId}/requests`).set(vera.authorization).send({ note: 'Hi!' })).body as JoinRequestDto;
  return { app, olivia, vera, group, itineraryId, ask };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface GET /api/nearby/trips
describe('Mocked: GET /api/nearby/trips', () => {
  // Mocked behavior: the trip's group is deleted between reading the trips and reading their groups
  // Input: Vera's position next to the trip
  // Expected status code: 200
  // Expected behavior: a trip without a group is left out rather than shown half-described
  // Expected output: { trips: [] }
  test("A trip's group disappears while listing", async () => {
    const { app, vera } = await openTrip();
    // The first read finds Vera's own groups (none); the second finds the trips' groups.
    jest.spyOn(GroupModel, 'find').mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await request(app).get(`/api/nearby/trips?${IN_TESTVILLE}`).set(vera.authorization);

    expect(response.status).toBe(200);
    expect((response.body as { trips: NearbyTripDto[] }).trips).toEqual([]);
  });

  // Mocked behavior: reading the open trips fails
  // Input: Vera's position
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Itinerary database fails', async () => {
    const { app, vera } = await openTrip();
    jest.spyOn(ItineraryModel, 'find').mockImplementation(simulatedOutage);

    const response = await request(app).get(`/api/nearby/trips?${IN_TESTVILLE}`).set(vera.authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// Interface PUT /api/nearby/trips/:itineraryId
describe('Mocked: PUT /api/nearby/trips/:itineraryId', () => {
  // Mocked behavior: saving the setting fails
  // Input: Olivia closes her trip
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Itinerary database write fails', async () => {
    const { app, olivia, itineraryId } = await openTrip();
    jest.spyOn(ItineraryModel, 'updateOne').mockImplementation(simulatedOutage);

    const response = await request(app).put(`/api/nearby/trips/${itineraryId}`).set(olivia.authorization).send({ openToJoin: false });

    expect(response.status).toBe(500);
  });
});

// Interface POST /api/nearby/trips/:itineraryId/requests
describe('Mocked: POST /api/nearby/trips/:itineraryId/requests', () => {
  // Mocked behavior: saving the request fails
  // Input: Vera asks to join
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Join request database write fails', async () => {
    const { app, vera, itineraryId } = await openTrip();
    jest.spyOn(JoinRequestModel, 'create').mockImplementation(simulatedOutage);

    const response = await request(app).post(`/api/nearby/trips/${itineraryId}/requests`).set(vera.authorization).send({});

    expect(response.status).toBe(500);
  });
});

// Interface GET /api/nearby/requests
describe('Mocked: GET /api/nearby/requests', () => {
  // Mocked behavior: reading the requests fails
  // Input: Olivia lists her group's requests
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Join request database fails', async () => {
    const { app, olivia, group } = await openTrip();
    jest.spyOn(JoinRequestModel, 'find').mockImplementation(simulatedOutage);

    const response = await request(app).get(`/api/nearby/requests?groupId=${group.id}`).set(olivia.authorization);

    expect(response.status).toBe(500);
  });
});

// Interface POST /api/nearby/requests/:requestId/accept
describe('Mocked: POST /api/nearby/requests/:requestId/accept', () => {
  // Mocked behavior: the group fills up to 12 members just before Olivia accepts
  // Input: Olivia accepts Vera's request
  // Expected status code: 409
  // Expected behavior: Vera is not added, and the request stays pending
  // Expected output: { error: "This group is full" }
  test('The group fills up before accepting', async () => {
    const { app, olivia, ask } = await openTrip();
    const joinRequest = await ask();
    jest.spyOn(GroupModel, 'findOneAndUpdate').mockResolvedValueOnce(null);

    const response = await request(app).post(`/api/nearby/requests/${joinRequest.id}/accept`).set(olivia.authorization);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'This group is full' });
    expect((await JoinRequestModel.findById(joinRequest.id))?.status).toBe('pending');
  });
});

// Interface POST /api/nearby/requests/:requestId/decline
describe('Mocked: POST /api/nearby/requests/:requestId/decline', () => {
  // Mocked behavior: saving the answer fails
  // Input: Olivia declines Vera's request
  // Expected status code: 500
  // Expected behavior: the request stays pending
  // Expected output: { error: "Internal server error" }
  test('Join request database write fails', async () => {
    const { app, olivia, ask } = await openTrip();
    const joinRequest = await ask();
    jest.spyOn(JoinRequestModel.prototype, 'save').mockImplementation(simulatedOutage);

    const response = await request(app).post(`/api/nearby/requests/${joinRequest.id}/decline`).set(olivia.authorization);

    expect(response.status).toBe(500);
    expect((await JoinRequestModel.findById(joinRequest.id))?.status).toBe('pending');
  });
});
