import request from 'supertest';

import { GroupModel } from '../../src/groups/groupModel';
import type { GroupDto } from '../../src/groups/groupService';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

function duplicateKeyError(): Error {
  return Object.assign(new Error('E11000 duplicate key error collection: groups index: inviteCode_1'), { code: 11000 });
}

function simulatedOutage(): never {
  throw new Error('Simulated database outage');
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /api/groups
describe('Mocked: POST /api/groups', () => {
  // Mocked behavior: the first invite code drawn is already taken by another group
  // Input: a group name
  // Expected status code: 201
  // Expected behavior: a new code is drawn and the group is created
  // Expected output: the group; the database insert was attempted twice
  test('Invite code collision is retried', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    const create = GroupModel.create.bind(GroupModel);
    const spy = jest.spyOn(GroupModel, 'create').mockRejectedValueOnce(duplicateKeyError()).mockImplementation(create);

    const response = await request(app).post('/api/groups').set(authorization).send({ name: 'Weekend crew' });

    expect(response.status).toBe(201);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await GroupModel.countDocuments()).toBe(1);
  });

  // Mocked behavior: every invite code drawn collides
  // Input: a group name
  // Expected status code: 503
  // Expected behavior: the server gives up after a few attempts instead of looping
  // Expected output: { error: "Could not create an invite code; please try again" }
  test('Invite codes keep colliding', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(GroupModel, 'create').mockRejectedValue(duplicateKeyError());

    const response = await request(app).post('/api/groups').set(authorization).send({ name: 'Weekend crew' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Could not create an invite code; please try again' });
  });

  // Mocked behavior: saving the group fails for another reason
  // Input: a group name
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Group database write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(GroupModel, 'create').mockImplementation(simulatedOutage);

    const response = await request(app).post('/api/groups').set(authorization).send({ name: 'Weekend crew' });

    expect(response.status).toBe(500);
  });
});

// Interface GET /api/groups
describe('Mocked: GET /api/groups', () => {
  // Mocked behavior: the group database query fails
  // Input: a signed-in traveller
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Group database query fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(GroupModel, 'find').mockImplementation(simulatedOutage);

    const response = await request(app).get('/api/groups').set(authorization);

    expect(response.status).toBe(500);
  });
});

// Interface POST /api/groups/join
describe('Mocked: POST /api/groups/join', () => {
  // Mocked behavior: adding the member to the group fails
  // Input: a valid invite code
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Group database update fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const joiner = await signedInUser(authService, 'Joiner');
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    jest.spyOn(GroupModel, 'findOneAndUpdate').mockImplementation(simulatedOutage);

    const response = await request(app).post('/api/groups/join').set(joiner.authorization).send({ inviteCode: group.inviteCode });

    expect(response.status).toBe(500);
  });
});

// Interface GET /api/groups/:groupId
describe('Mocked: GET /api/groups/:groupId', () => {
  // Mocked behavior: the group database read fails
  // Input: a valid group id
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Group database read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(GroupModel, 'findOne').mockImplementation(simulatedOutage);

    const response = await request(app).get('/api/groups/64b7f0c2a1b2c3d4e5f60718').set(authorization);

    expect(response.status).toBe(500);
  });
});

// Interface PUT /api/groups/:groupId/members/me
describe('Mocked: PUT /api/groups/:groupId/members/me', () => {
  // Mocked behavior: the member is removed from the group between the membership check and the update
  // Input: new interests for a group the traveller was in a moment ago
  // Expected status code: 404
  // Expected behavior: nothing is written for a former member
  // Expected output: { error: "Group not found" }
  test('Member removed during the update', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    const group = (await request(app).post('/api/groups').set(authorization).send({ name: 'Crew' })).body as GroupDto;
    jest.spyOn(GroupModel, 'findOneAndUpdate').mockResolvedValue(null);

    const response = await request(app).put(`/api/groups/${group.id}/members/me`).set(authorization).send({ interests: ['food'] });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Group not found' });
  });
});

// Interface DELETE /api/groups/:groupId/members/:userId
describe('Mocked: DELETE /api/groups/:groupId/members/:userId', () => {
  // Mocked behavior: removing the member from the group fails
  // Input: a member leaving
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Group database update fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const member = await signedInUser(authService, 'Member');
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    jest.spyOn(GroupModel, 'updateOne').mockImplementation(simulatedOutage);

    const response = await request(app).delete(`/api/groups/${group.id}/members/${member.userId}`).set(member.authorization);

    expect(response.status).toBe(500);
  });
});

// Interface DELETE /api/groups/:groupId
describe('Mocked: DELETE /api/groups/:groupId', () => {
  // Mocked behavior: deleting the group's itineraries fails
  // Input: the owner deletes the group
  // Expected status code: 500
  // Expected behavior: the group is kept, so no itinerary is left without its group
  // Expected output: { error: "Internal server error" }
  test('Itinerary database delete fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    const group = (await request(app).post('/api/groups').set(authorization).send({ name: 'Crew' })).body as GroupDto;
    jest.spyOn(ItineraryModel, 'deleteMany').mockImplementation(simulatedOutage);

    const response = await request(app).delete(`/api/groups/${group.id}`).set(authorization);

    expect(response.status).toBe(500);
    expect(await GroupModel.countDocuments()).toBe(1);
  });
});
