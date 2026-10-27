import request from 'supertest';

import { UserModel } from '../../src/auth/userModel';
import { GroupModel } from '../../src/groups/groupModel';
import { type GroupDto, type GroupSummaryDto, MAX_GROUP_MEMBERS } from '../../src/groups/groupService';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

const TRIP = { city: 'Vancouver', startDate: '2026-10-24', endDate: '2026-10-25' };
const INVITE_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

async function createGroup(app: Parameters<typeof request>[0], authorization: Record<string, string>, name = 'Weekend crew'): Promise<GroupDto> {
  const response = await request(app).post('/api/groups').set(authorization).send({ name });
  return response.body as GroupDto;
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface POST /api/groups
describe('Unmocked: POST /api/groups', () => {
  // Input: a group name from a traveller whose profile interests are museums and food
  // Expected status code: 201
  // Expected behavior: a group is stored with the caller as its owner and a fresh invite code
  // Expected output: the group, with the owner's profile interests copied as their group interests
  test('Creates a group owned by the caller', async () => {
    const { app, authService } = createTestApp();
    const { userId, authorization } = await signedInUser(authService, 'Noah Owner');
    await UserModel.updateOne({ _id: userId }, { interests: ['museums', 'food'] });

    const response = await request(app).post('/api/groups').set(authorization).send({ name: '  Weekend crew  ' });

    const group = response.body as GroupDto;
    expect(response.status).toBe(201);
    expect(group).toMatchObject({ name: 'Weekend crew', myRole: 'owner' });
    expect(group.inviteCode).toMatch(INVITE_CODE);
    expect(group.members).toEqual([
      { userId, name: 'Noah Owner', role: 'owner', interests: ['museums', 'food'], vetoedActivityIds: [] },
    ]);
    expect(await GroupModel.countDocuments()).toBe(1);
  });

  // Input: an empty name and a 61-character name
  // Expected status code: 400 for each
  // Expected behavior: no group is created
  // Expected output: { error: "Invalid request", details: [...] }
  test.each(['', 'x'.repeat(61)])('Invalid name %#', async (name) => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).post('/api/groups').set(authorization).send({ name });

    expect(response.status).toBe(400);
    expect(await GroupModel.countDocuments()).toBe(0);
  });

  // Input: a group name without an Authorization header
  // Expected status code: 401
  // Expected behavior: no group is created
  // Expected output: { error: "Missing session token" }
  test('Not signed in', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/api/groups').send({ name: 'Weekend crew' });

    expect(response.status).toBe(401);
  });
});

// Interface GET /api/groups
describe('Unmocked: GET /api/groups', () => {
  // Input: a traveller who created two groups and joined a third, while a stranger has a fourth
  // Expected status code: 200
  // Expected behavior: only the traveller's groups are listed, newest first, with their role in each
  // Expected output: { groups: [joined (member), second (owner), first (owner)] }
  test("Lists the caller's groups", async () => {
    const { app, authService } = createTestApp();
    const traveller = await signedInUser(authService, 'Traveller');
    const friend = await signedInUser(authService, 'Friend');
    const stranger = await signedInUser(authService, 'Stranger');
    await createGroup(app, traveller.authorization, 'First');
    await createGroup(app, traveller.authorization, 'Second');
    const friendsGroup = await createGroup(app, friend.authorization, 'Friends');
    await createGroup(app, stranger.authorization, 'Strangers');
    await request(app).post('/api/groups/join').set(traveller.authorization).send({ inviteCode: friendsGroup.inviteCode });

    const response = await request(app).get('/api/groups').set(traveller.authorization);

    const groups = (response.body as { groups: GroupSummaryDto[] }).groups;
    expect(response.status).toBe(200);
    expect(groups.map((group) => [group.name, group.myRole, group.memberCount])).toEqual([
      ['Friends', 'member', 2],
      ['Second', 'owner', 1],
      ['First', 'owner', 1],
    ]);
  });

  // Input: a traveller in no group
  // Expected status code: 200
  // Expected behavior: nothing is listed
  // Expected output: { groups: [] }
  test('No groups yet', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).get('/api/groups').set(authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ groups: [] });
  });
});

// Interface POST /api/groups/join
describe('Unmocked: POST /api/groups/join', () => {
  // Input: another group's invite code, typed in lower case with spaces, by a traveller interested in outdoors
  // Expected status code: 200
  // Expected behavior: the traveller becomes a member, with their profile interests as group interests
  // Expected output: the group, now with two members, and myRole "member"
  test('Joins with an invite code', async () => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const joiner = await signedInUser(authService, 'Joiner');
    await UserModel.updateOne({ _id: joiner.userId }, { interests: ['outdoors'] });
    const group = await createGroup(app, owner.authorization);

    const response = await request(app)
      .post('/api/groups/join')
      .set(joiner.authorization)
      .send({ inviteCode: ` ${group.inviteCode.toLowerCase()} ` });

    const joined = response.body as GroupDto;
    expect(response.status).toBe(200);
    expect(joined.myRole).toBe('member');
    expect(joined.members.map((member) => [member.name, member.role, member.interests])).toEqual([
      ['Owner', 'owner', []],
      ['Joiner', 'member', ['outdoors']],
    ]);
  });

  // Input: the invite code of a group the traveller already belongs to
  // Expected status code: 200
  // Expected behavior: nothing changes
  // Expected output: the group, still with one member
  test('Joining twice changes nothing', async () => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService);
    const group = await createGroup(app, owner.authorization);

    const response = await request(app).post('/api/groups/join').set(owner.authorization).send({ inviteCode: group.inviteCode });

    expect(response.status).toBe(200);
    expect((response.body as GroupDto).members).toHaveLength(1);
  });

  // Input: a well-formed invite code that no group has
  // Expected status code: 404
  // Expected behavior: the traveller joins nothing
  // Expected output: { error: "No group has that invite code" }
  test('Unknown invite code', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).post('/api/groups/join').set(authorization).send({ inviteCode: 'ZZZZZZ' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'No group has that invite code' });
  });

  // Input: invite codes of the wrong length, and a missing code
  // Expected status code: 400 for each
  // Expected behavior: nothing is looked up
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([{ inviteCode: 'ABC' }, { inviteCode: 'ABCDEFG' }, {}])('Malformed invite code %#', async (body) => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);

    const response = await request(app).post('/api/groups/join').set(authorization).send(body);

    expect(response.status).toBe(400);
  });

  // Input: the invite code of a group that already has the maximum number of members
  // Expected status code: 409
  // Expected behavior: the traveller is not added
  // Expected output: { error: "This group is full" }
  test('Group is full', async () => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const group = await createGroup(app, owner.authorization);
    for (let index = 1; index < MAX_GROUP_MEMBERS; index += 1) {
      const member = await signedInUser(authService, `Member ${String(index)}`);
      await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    }
    const latecomer = await signedInUser(authService, 'Latecomer');

    const response = await request(app).post('/api/groups/join').set(latecomer.authorization).send({ inviteCode: group.inviteCode });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'This group is full' });
    expect((await GroupModel.findById(group.id))?.members).toHaveLength(MAX_GROUP_MEMBERS);
  });
});

// Interface GET /api/groups/:groupId
describe('Unmocked: GET /api/groups/:groupId', () => {
  // Input: the id of a group the traveller belongs to, one of whose members has since deleted their account
  // Expected status code: 200
  // Expected behavior: the group is read back with every member's name; a deleted account shows a placeholder
  // Expected output: the group with members "Owner" and "Former traveller"
  test('Member reads the group', async () => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const member = await signedInUser(authService, 'Gone Member');
    const group = await createGroup(app, owner.authorization);
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    await UserModel.deleteOne({ _id: member.userId });

    const response = await request(app).get(`/api/groups/${group.id}`).set(owner.authorization);

    expect(response.status).toBe(200);
    expect((response.body as GroupDto).members.map((entry) => entry.name)).toEqual(['Owner', 'Former traveller']);
  });

  // Input: a group the traveller is not in, an invalid id, and an id matching no group
  // Expected status code: 404 for each
  // Expected behavior: groups are not revealed to non-members
  // Expected output: { error: "Group not found" }
  test.each(['stranger', 'not-an-id', '64b7f0c2a1b2c3d4e5f60718'])('Group not visible: %s', async (which) => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const stranger = await signedInUser(authService, 'Stranger');
    const group = await createGroup(app, owner.authorization);
    const groupId = which === 'stranger' ? group.id : which;

    const response = await request(app).get(`/api/groups/${groupId}`).set(stranger.authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Group not found' });
  });
});

// Interface PUT /api/groups/:groupId/members/me
describe('Unmocked: PUT /api/groups/:groupId/members/me', () => {
  // Input: a member sets interests [outdoors, food, outdoors] and vetoes two activities, then sends only interests
  // Expected status code: 200 for both
  // Expected behavior: only that member's preferences change; duplicates are dropped; fields not sent are kept
  // Expected output: the member with interests [outdoors, food] then [museums], and the two vetoes both times
  test("Sets the caller's interests and vetoes", async () => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const member = await signedInUser(authService, 'Member');
    const group = await createGroup(app, owner.authorization);
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    const vetoes = ['64b7f0c2a1b2c3d4e5f60718', '64b7f0c2a1b2c3d4e5f60719'];

    const first = await request(app)
      .put(`/api/groups/${group.id}/members/me`)
      .set(member.authorization)
      .send({ interests: ['outdoors', 'food', 'outdoors'], vetoedActivityIds: vetoes });
    const second = await request(app).put(`/api/groups/${group.id}/members/me`).set(member.authorization).send({ interests: ['museums'] });

    expect(first.status).toBe(200);
    expect((first.body as GroupDto).members.at(1)).toMatchObject({ interests: ['outdoors', 'food'], vetoedActivityIds: vetoes });
    expect(second.status).toBe(200);
    expect((second.body as GroupDto).members).toEqual([
      expect.objectContaining({ name: 'Owner', interests: [], vetoedActivityIds: [] }),
      expect.objectContaining({ name: 'Member', interests: ['museums'], vetoedActivityIds: vetoes }),
    ]);
  });

  // Input: an unknown interest tag, and a veto that is not an activity id
  // Expected status code: 400 for each
  // Expected behavior: nothing changes
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([{ interests: ['skydiving'] }, { vetoedActivityIds: ['stanley-park'] }])('Invalid preferences %#', async (body) => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService);
    const group = await createGroup(app, owner.authorization);

    const response = await request(app).put(`/api/groups/${group.id}/members/me`).set(owner.authorization).send(body);

    expect(response.status).toBe(400);
  });

  // Input: preferences for a group the traveller is not in
  // Expected status code: 404
  // Expected behavior: the group is not changed
  // Expected output: { error: "Group not found" }
  test('Not a member', async () => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const stranger = await signedInUser(authService, 'Stranger');
    const group = await createGroup(app, owner.authorization);

    const response = await request(app).put(`/api/groups/${group.id}/members/me`).set(stranger.authorization).send({ interests: ['food'] });

    expect(response.status).toBe(404);
  });
});

// Interface DELETE /api/groups/:groupId/members/:userId
describe('Unmocked: DELETE /api/groups/:groupId/members/:userId', () => {
  // Input: a member removes themselves from a group that has a group itinerary
  // Expected status code: 204
  // Expected behavior: they leave the group and can no longer see its itinerary
  // Expected output: an empty body; the group no longer lists them; their GET of the itinerary returns 404
  test('Member leaves', async () => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const member = await signedInUser(authService, 'Member');
    await seedVancouver(activityService);
    const group = await createGroup(app, owner.authorization);
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    const trip = await request(app).post('/api/itineraries/generate').set(owner.authorization).send({ ...TRIP, groupId: group.id });

    const response = await request(app).delete(`/api/groups/${group.id}/members/${member.userId}`).set(member.authorization);

    expect(response.status).toBe(204);
    expect((await GroupModel.findById(group.id))?.members).toHaveLength(1);
    const itinerary = await request(app).get(`/api/itineraries/${String(trip.body.id)}`).set(member.authorization);
    expect(itinerary.status).toBe(404);
  });

  // Input: the owner removes a member
  // Expected status code: 204
  // Expected behavior: the member is removed
  // Expected output: an empty body; the group has only the owner
  test('Owner removes a member', async () => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const member = await signedInUser(authService, 'Member');
    const group = await createGroup(app, owner.authorization);
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });

    const response = await request(app).delete(`/api/groups/${group.id}/members/${member.userId}`).set(owner.authorization);

    expect(response.status).toBe(204);
    expect((await GroupModel.findById(group.id))?.members.map((entry) => entry.role)).toEqual(['owner']);
  });

  // Input: a member tries to remove another member; the owner tries to leave; someone removes a non-member
  // Expected status code: 403, 409 and 404 respectively
  // Expected behavior: nobody is removed
  // Expected output: the matching error message
  test.each([
    ['member removes member', 403, 'Only the group owner can remove members'],
    ['owner leaves', 409, 'The owner cannot leave the group; delete it instead'],
    ['non-member removed', 404, 'Member not found'],
  ])('Removal refused: %s', async (scenario, status, error) => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const first = await signedInUser(authService, 'First Member');
    const second = await signedInUser(authService, 'Second Member');
    const outsider = await signedInUser(authService, 'Outsider');
    const group = await createGroup(app, owner.authorization);
    for (const member of [first, second]) {
      await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    }
    const [caller, targetId] =
      scenario === 'member removes member'
        ? [first.authorization, second.userId]
        : scenario === 'owner leaves'
          ? [owner.authorization, owner.userId]
          : [owner.authorization, outsider.userId];

    const response = await request(app).delete(`/api/groups/${group.id}/members/${targetId}`).set(caller);

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error });
    expect((await GroupModel.findById(group.id))?.members).toHaveLength(3);
  });
});

// Interface DELETE /api/groups/:groupId
describe('Unmocked: DELETE /api/groups/:groupId', () => {
  // Input: the owner deletes a group that has one group itinerary, while they also have a personal itinerary
  // Expected status code: 204
  // Expected behavior: the group and its itinerary are deleted; the personal itinerary is kept
  // Expected output: an empty body; no groups and one itinerary left
  test('Owner deletes the group and its itineraries', async () => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService);
    await seedVancouver(activityService);
    const group = await createGroup(app, owner.authorization);
    await request(app).post('/api/itineraries/generate').set(owner.authorization).send({ ...TRIP, groupId: group.id });
    await request(app).post('/api/itineraries/generate').set(owner.authorization).send(TRIP);

    const response = await request(app).delete(`/api/groups/${group.id}`).set(owner.authorization);

    expect(response.status).toBe(204);
    expect(await GroupModel.countDocuments()).toBe(0);
    expect(await ItineraryModel.countDocuments()).toBe(1);
    expect((await ItineraryModel.findOne())?.groupId).toBeUndefined();
  });

  // Input: a member who is not the owner tries to delete the group
  // Expected status code: 403
  // Expected behavior: the group is kept
  // Expected output: { error: "Only the group owner can delete the group" }
  test('Member cannot delete', async () => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const member = await signedInUser(authService, 'Member');
    const group = await createGroup(app, owner.authorization);
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });

    const response = await request(app).delete(`/api/groups/${group.id}`).set(member.authorization);

    expect(response.status).toBe(403);
    expect(await GroupModel.countDocuments()).toBe(1);
  });

  // Input: a traveller deletes a group they are not in
  // Expected status code: 404
  // Expected behavior: the group is kept
  // Expected output: { error: "Group not found" }
  test('Not a member', async () => {
    const { app, authService } = createTestApp();
    const owner = await signedInUser(authService, 'Owner');
    const stranger = await signedInUser(authService, 'Stranger');
    const group = await createGroup(app, owner.authorization);

    const response = await request(app).delete(`/api/groups/${group.id}`).set(stranger.authorization);

    expect(response.status).toBe(404);
    expect(await GroupModel.countDocuments()).toBe(1);
  });
});
