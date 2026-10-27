import request from 'supertest';

import { UserModel } from '../../src/auth/userModel';
import { FriendshipModel } from '../../src/friends/friendshipModel';
import type { FriendListsDto, TravellerDto, TravellerProfileDto } from '../../src/friends/friendService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

type Traveller = Awaited<ReturnType<typeof signedInUser>>;

// Four signed-in travellers (Ben lives in Toronto), and a client that calls the API as any of them.
async function travellers() {
  const { app, authService } = createTestApp();
  const ava = await signedInUser(authService, 'Ava Traveller');
  const ben = await signedInUser(authService, 'Ben Traveller');
  const cleo = await signedInUser(authService, 'Cleo Traveller');
  const dan = await signedInUser(authService, 'Dan Traveller');
  await UserModel.updateOne({ _id: ben.userId }, { $set: { homeCity: 'Toronto' } });
  const client = (user: Traveller) => ({
    get: (path: string) => request(app).get(path).set(user.authorization),
    post: (path: string, body: object = {}) => request(app).post(path).set(user.authorization).send(body),
    put: (path: string, body: object) => request(app).put(path).set(user.authorization).send(body),
    delete: (path: string) => request(app).delete(path).set(user.authorization),
  });
  return { app, ava, ben, cleo, dan, client };
}

function names(travellerList: TravellerDto[]): string[] {
  return travellerList.map((traveller) => traveller.name);
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface GET /api/travellers
describe('Unmocked: GET /api/travellers', () => {
  // Input: Ava searches "travel" (part of every name) and "CLEO.traveller@example.com" (an email, other case)
  // Expected status code: 200 for both
  // Expected behavior: name matches ignore case and leave out the caller; an email must match exactly
  // Expected output: Ben, Cleo and Dan by name, each with friendship "none"; then only Cleo
  test('Finds travellers by part of their name or their exact email', async () => {
    const { ava, client } = await travellers();

    const byName = await client(ava).get('/api/travellers?search=travel');
    const byEmail = await client(ava).get('/api/travellers?search=CLEO.traveller@example.com');

    const found = (byName.body as { travellers: TravellerDto[] }).travellers;
    expect(byName.status).toBe(200);
    expect(names(found)).toEqual(['Ben Traveller', 'Cleo Traveller', 'Dan Traveller']);
    expect(found.at(0)).toMatchObject({ homeCity: 'Toronto', isPrivate: false, friendship: 'none' });
    expect(byEmail.status).toBe(200);
    expect(names((byEmail.body as { travellers: TravellerDto[] }).travellers)).toEqual(['Cleo Traveller']);
  });

  // Input: Ava searches "traveller" after asking Ben, being asked by Cleo, and becoming friends with Dan
  // Expected status code: 200
  // Expected behavior: each result says how that traveller relates to Ava
  // Expected output: Ben "requested", Cleo "incoming", Dan "friends"
  test("Shows each traveller's friendship with the caller", async () => {
    const { ava, ben, cleo, dan, client } = await travellers();
    await client(ava).post('/api/friends/requests', { userId: ben.userId });
    await client(cleo).post('/api/friends/requests', { userId: ava.userId });
    await client(dan).post('/api/friends/requests', { userId: ava.userId });
    await client(ava).post(`/api/friends/requests/${dan.userId}/accept`);

    const response = await client(ava).get('/api/travellers?search=traveller');

    const found = (response.body as { travellers: TravellerDto[] }).travellers;
    expect(found.map((traveller) => traveller.friendship)).toEqual(['requested', 'incoming', 'friends']);
  });

  // Input: Ben's account is private; Ava searches for him before and after they become friends
  // Expected status code: 200
  // Expected behavior: a private account's home city is shown only to its friends
  // Expected output: Ben with homeCity "" and isPrivate true, then with homeCity "Toronto"
  test("Hides a private account's home city from everyone but its friends", async () => {
    const { ava, ben, client } = await travellers();
    await client(ben).put('/api/friends/privacy', { isPrivate: true });

    const before = await client(ava).get('/api/travellers?search=ben');
    await client(ava).post('/api/friends/requests', { userId: ben.userId });
    await client(ben).post(`/api/friends/requests/${ava.userId}/accept`);
    const after = await client(ava).get('/api/travellers?search=ben');

    expect((before.body as { travellers: TravellerDto[] }).travellers).toEqual([
      { id: ben.userId, name: 'Ben Traveller', homeCity: '', isPrivate: true, friendship: 'none' },
    ]);
    expect((after.body as { travellers: TravellerDto[] }).travellers.at(0)).toMatchObject({ homeCity: 'Toronto', friendship: 'friends' });
  });

  // Input: searches ".*" and "Ava" (only the caller's own name)
  // Expected status code: 200
  // Expected behavior: the text is matched literally, never as a pattern, and the caller is never listed
  // Expected output: no travellers for either
  test.each(['.*', 'Ava'])('Search %p finds nobody', async (search) => {
    const { ava, client } = await travellers();

    const response = await client(ava).get(`/api/travellers?search=${encodeURIComponent(search)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ travellers: [] });
  });

  // Input: no search text, one character, and 61 characters
  // Expected status code: 400 for each
  // Expected behavior: nothing is searched
  // Expected output: { error: "Invalid request", details: [...] }
  test.each(['', '?search=a', `?search=${'a'.repeat(61)}`])('Invalid search %p', async (query) => {
    const { ava, client } = await travellers();

    const response = await client(ava).get(`/api/travellers${query}`);

    expect(response.status).toBe(400);
    expect((response.body as { error: string }).error).toBe('Invalid request');
  });

  // Input: a search without an Authorization header
  // Expected status code: 401
  // Expected behavior: nothing is searched
  // Expected output: { error: "Missing session token" }
  test('Not signed in', async () => {
    const { app } = await travellers();

    const response = await request(app).get('/api/travellers?search=travel');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing session token' });
  });
});

// Interface GET /api/travellers/:userId
describe('Unmocked: GET /api/travellers/:userId', () => {
  // Input: Ava views Ben, who is friends with Cleo and Dan
  // Expected status code: 200
  // Expected behavior: Ben's details, his friendship with Ava and how many friends he has
  // Expected output: Ben with friendship "none" and friendCount 2
  test('Returns a traveller with their friendship and friend count', async () => {
    const { ava, ben, cleo, dan, client } = await travellers();
    for (const friend of [cleo, dan]) {
      await client(friend).post('/api/friends/requests', { userId: ben.userId });
      await client(ben).post(`/api/friends/requests/${friend.userId}/accept`);
    }

    const response = await client(ava).get(`/api/travellers/${ben.userId}`);

    expect(response.status).toBe(200);
    expect(response.body as TravellerProfileDto).toEqual({
      id: ben.userId,
      name: 'Ben Traveller',
      homeCity: 'Toronto',
      isPrivate: false,
      friendship: 'none',
      friendCount: 2,
    });
  });

  // Input: Ben, whose account is private, views himself
  // Expected status code: 200
  // Expected behavior: travellers always see their own details
  // Expected output: Ben with friendship "self" and his home city
  test('Viewing yourself', async () => {
    const { ben, client } = await travellers();
    await client(ben).put('/api/friends/privacy', { isPrivate: true });

    const response = await client(ben).get(`/api/travellers/${ben.userId}`);

    expect(response.body).toMatchObject({ friendship: 'self', homeCity: 'Toronto', isPrivate: true });
  });

  // Input: an id no user has, and an id that is not an id at all
  // Expected status code: 404 for both
  // Expected behavior: nothing is revealed
  // Expected output: { error: "Traveller not found" }
  test.each(['64b7f0c2a1b2c3d4e5f60718', 'not-an-id'])('Unknown traveller %p', async (userId) => {
    const { ava, client } = await travellers();

    const response = await client(ava).get(`/api/travellers/${userId}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Traveller not found' });
  });
});

// Interface GET /api/friends
describe('Unmocked: GET /api/friends', () => {
  // Input: Ava is friends with Ben, Cleo asked Ava, and Ava asked Dan
  // Expected status code: 200
  // Expected behavior: each traveller is in exactly one list, by name
  // Expected output: { isPrivate: false, friends: [Ben], incoming: [Cleo], outgoing: [Dan] }
  test("Lists the caller's friends, received and sent requests, and privacy", async () => {
    const { ava, ben, cleo, dan, client } = await travellers();
    await client(ben).post('/api/friends/requests', { userId: ava.userId });
    await client(ava).post(`/api/friends/requests/${ben.userId}/accept`);
    await client(cleo).post('/api/friends/requests', { userId: ava.userId });
    await client(ava).post('/api/friends/requests', { userId: dan.userId });

    const response = await client(ava).get('/api/friends');

    const lists = response.body as FriendListsDto;
    expect(response.status).toBe(200);
    expect(lists.isPrivate).toBe(false);
    expect(names(lists.friends)).toEqual(['Ben Traveller']);
    expect(names(lists.incoming)).toEqual(['Cleo Traveller']);
    expect(names(lists.outgoing)).toEqual(['Dan Traveller']);
  });

  // Input: a traveller with no friends or requests
  // Expected status code: 200
  // Expected behavior: nothing to list
  // Expected output: { isPrivate: false, friends: [], incoming: [], outgoing: [] }
  test('No friends yet', async () => {
    const { ava, client } = await travellers();

    const response = await client(ava).get('/api/friends');

    expect(response.body).toEqual({ isPrivate: false, friends: [], incoming: [], outgoing: [] });
  });

  // Input: a valid session for a user that has since been deleted
  // Expected status code: 404
  // Expected behavior: nothing is listed
  // Expected output: { error: "Traveller not found" }
  test('Deleted user', async () => {
    const { ava, client } = await travellers();
    await UserModel.deleteOne({ _id: ava.userId });

    const response = await client(ava).get('/api/friends');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Traveller not found' });
  });
});

// Interface POST /api/friends/requests
describe('Unmocked: POST /api/friends/requests', () => {
  // Input: Ava asks Ben, then asks him again
  // Expected status code: 201, then 200
  // Expected behavior: one pending request is saved; Ben sees it as incoming
  // Expected output: Ben with friendship "requested" both times
  test('Sends a friend request once', async () => {
    const { ava, ben, client } = await travellers();

    const first = await client(ava).post('/api/friends/requests', { userId: ben.userId });
    const again = await client(ava).post('/api/friends/requests', { userId: ben.userId });

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ id: ben.userId, friendship: 'requested' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ friendship: 'requested' });
    expect(await FriendshipModel.countDocuments()).toBe(1);
    expect(names(((await client(ben).get('/api/friends')).body as FriendListsDto).incoming)).toEqual(['Ava Traveller']);
  });

  // Input: Ben asked Ava; then Ava asks Ben, and asks again once they are friends
  // Expected status code: 200 for both
  // Expected behavior: Ava's request accepts Ben's, so they become friends; asking a friend changes nothing
  // Expected output: Ben with friendship "friends" both times
  test("Asking someone who asked you first makes you friends", async () => {
    const { ava, ben, client } = await travellers();
    await client(ben).post('/api/friends/requests', { userId: ava.userId });

    const accepted = await client(ava).post('/api/friends/requests', { userId: ben.userId });
    const again = await client(ava).post('/api/friends/requests', { userId: ben.userId });

    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ friendship: 'friends' });
    expect(again.body).toMatchObject({ friendship: 'friends' });
    expect((await FriendshipModel.findOne())?.status).toBe('accepted');
  });

  // Input: Ava asks herself, a user id nobody has, and something that is not an id
  // Expected status code: 400, 404 and 400
  // Expected behavior: nothing is saved
  // Expected output: the matching error
  test.each([
    ['yourself', 'self', 400, 'You cannot add yourself as a friend'],
    ['an unknown traveller', '64b7f0c2a1b2c3d4e5f60718', 404, 'Traveller not found'],
    ['a malformed id', 'not-an-id', 400, 'Invalid request'],
  ])('Request refused: %s', async (_scenario, target, status, error) => {
    const { ava, client } = await travellers();

    const response = await client(ava).post('/api/friends/requests', { userId: target === 'self' ? ava.userId : target });

    expect(response.status).toBe(status);
    expect((response.body as { error: string }).error).toBe(error);
    expect(await FriendshipModel.countDocuments()).toBe(0);
  });
});

// Interface POST /api/friends/requests/:userId/accept
describe('Unmocked: POST /api/friends/requests/:userId/accept', () => {
  // Input: Ben asked Ava; Ava accepts
  // Expected status code: 200
  // Expected behavior: the two are friends, and each lists the other as a friend
  // Expected output: Ben with friendship "friends"
  test('Accepts a received request', async () => {
    const { ava, ben, client } = await travellers();
    await client(ben).post('/api/friends/requests', { userId: ava.userId });

    const response = await client(ava).post(`/api/friends/requests/${ben.userId}/accept`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: ben.userId, friendship: 'friends' });
    expect(names(((await client(ben).get('/api/friends')).body as FriendListsDto).friends)).toEqual(['Ava Traveller']);
  });

  // Input: Ava "accepts" the request she sent Ben, a request that does not exist, and a malformed id
  // Expected status code: 404 for each
  // Expected behavior: nothing changes; only the recipient can accept a request
  // Expected output: { error: "Friend request not found" }
  test.each(['own request', 'no request', 'malformed id'])('Nothing to accept: %s', async (scenario) => {
    const { ava, ben, client } = await travellers();
    if (scenario === 'own request') {
      await client(ava).post('/api/friends/requests', { userId: ben.userId });
    }
    const target = scenario === 'malformed id' ? 'not-an-id' : ben.userId;

    const response = await client(ava).post(`/api/friends/requests/${target}/accept`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Friend request not found' });
  });
});

// Interface DELETE /api/friends/:userId
describe('Unmocked: DELETE /api/friends/:userId', () => {
  // Input: Ava removes Ben after they became friends, after she asked him, and after he asked her
  // Expected status code: 204 for each
  // Expected behavior: unfriending, cancelling and declining all remove the friendship or request
  // Expected output: no body; no friendship is left
  test.each(['unfriend', 'cancel a sent request', 'decline a received request'])('Removes: %s', async (scenario) => {
    const { ava, ben, client } = await travellers();
    const [from, to] = scenario === 'cancel a sent request' ? [ava, ben] : [ben, ava];
    await client(from).post('/api/friends/requests', { userId: to.userId });
    if (scenario === 'unfriend') {
      await client(ava).post(`/api/friends/requests/${ben.userId}/accept`);
    }

    const response = await client(ava).delete(`/api/friends/${ben.userId}`);

    expect(response.status).toBe(204);
    expect(await FriendshipModel.countDocuments()).toBe(0);
  });

  // Input: Ava removes Ben with no friendship or request between them
  // Expected status code: 404
  // Expected behavior: nothing changes
  // Expected output: { error: "You have no friendship or request with this traveller" }
  test('Nothing to remove', async () => {
    const { ava, ben, client } = await travellers();

    const response = await client(ava).delete(`/api/friends/${ben.userId}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'You have no friendship or request with this traveller' });
  });
});

// Interface PUT /api/friends/privacy
describe('Unmocked: PUT /api/friends/privacy', () => {
  // Input: { isPrivate: true }, then { isPrivate: false }
  // Expected status code: 200 for both
  // Expected behavior: the setting is saved and reported back by GET /api/friends
  // Expected output: { isPrivate: true }, then { isPrivate: false }
  test('Makes the account private, then public again', async () => {
    const { ava, client } = await travellers();

    const madePrivate = await client(ava).put('/api/friends/privacy', { isPrivate: true });
    const listed = await client(ava).get('/api/friends');
    const madePublic = await client(ava).put('/api/friends/privacy', { isPrivate: false });

    expect(madePrivate.status).toBe(200);
    expect(madePrivate.body).toEqual({ isPrivate: true });
    expect((listed.body as FriendListsDto).isPrivate).toBe(true);
    expect(madePublic.body).toEqual({ isPrivate: false });
  });

  // Input: an empty body, and isPrivate "yes"
  // Expected status code: 400 for both
  // Expected behavior: the setting is unchanged
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([{}, { isPrivate: 'yes' }])('Invalid privacy setting %p', async (body) => {
    const { ava, client } = await travellers();

    const response = await client(ava).put('/api/friends/privacy', body);

    expect(response.status).toBe(400);
    expect((await UserModel.findById(ava.userId))?.isPrivate).toBe(false);
  });

  // Input: { isPrivate: true } for a user that has since been deleted
  // Expected status code: 404
  // Expected behavior: nothing is created
  // Expected output: { error: "User not found" }
  test('Deleted user', async () => {
    const { ava, client } = await travellers();
    await UserModel.deleteOne({ _id: ava.userId });

    const response = await client(ava).put('/api/friends/privacy', { isPrivate: true });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'User not found' });
    expect(await UserModel.countDocuments({ _id: ava.userId })).toBe(0);
  });
});
