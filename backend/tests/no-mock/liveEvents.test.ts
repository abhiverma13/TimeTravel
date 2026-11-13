import { Types } from 'mongoose';
import request from 'supertest';
import type { Socket } from 'socket.io-client';

import { ActivityModel } from '../../src/activities/activityModel';
import type { GroupDto } from '../../src/groups/groupService';
import type { JoinRequestDto } from '../../src/nearby/nearbyService';
import type { PostDetailDto } from '../../src/posts/postService';
import type { LiveEvent } from '../../src/sync/liveEvents';
import { connectClient, startLiveServer } from '../helpers/liveServer';
import { type TestApp, createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

type Traveller = Awaited<ReturnType<typeof signedInUser>>;

/** A connected device that records every live event it receives. */
interface Device {
  socket: Socket;
  events: LiveEvent[];
  /** Resolves with the next live event. */
  next: () => Promise<LiveEvent>;
}

// Two days before the Testville trip (Saturday 2026-10-24), so it can be opened to travellers nearby.
const TWO_DAYS_BEFORE = new Date('2026-10-22T12:00:00Z');

/** The test app served with live updates, and a way to sign travellers in with a connected device each. */
async function liveApp(testApp: TestApp = createTestApp()) {
  const live = await startLiveServer(testApp);
  const devices: Device[] = [];
  const connect = async (traveller: Traveller): Promise<Device> => {
    const socket = await connectClient(live.url, traveller.authorization);
    const events: LiveEvent[] = [];
    socket.on('liveEvent', (event: LiveEvent) => events.push(event));
    const device = { socket, events, next: async () => new Promise<LiveEvent>((resolve) => socket.once('liveEvent', resolve)) };
    devices.push(device);
    return device;
  };
  const client = (user: Traveller) => ({
    post: (path: string, body: object = {}) => request(testApp.app).post(path).set(user.authorization).send(body),
    put: (path: string, body: object = {}) => request(testApp.app).put(path).set(user.authorization).send(body),
    delete: (path: string) => request(testApp.app).delete(path).set(user.authorization),
  });
  const close = async () => {
    devices.forEach((device) => device.socket.disconnect());
    await live.close();
  };
  return { ...testApp, connect, client, close };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface Socket.io: liveEvent { type, text, actorId, groupId?, tripId?, postId?, at }, after POST /api/friends/requests,
// POST /api/friends/requests/:userId/accept and DELETE /api/friends/:userId
describe('Unmocked: Socket.io live events for friends', () => {
  // Input: Ava asks Ben to be friends, Ben accepts, Ava unfriends him; Cleo's request to Ava is declined; Ben asks Cleo
  //        and cancels; Ava and Cleo ask each other
  // Expected status code: none (Socket.io); the REST calls succeed
  // Expected behavior: the other traveller's devices hear of each change at once; the traveller who acted hears nothing
  // Expected output: liveEvent with the matching type and text each time
  test('Requests, acceptances and removals reach the other traveller', async () => {
    const { authService, connect, client, close } = await liveApp();
    const ava = await signedInUser(authService, 'Ava Traveller');
    const ben = await signedInUser(authService, 'Ben Traveller');
    const cleo = await signedInUser(authService, 'Cleo Traveller');
    const [avaDevice, benDevice, cleoDevice] = [await connect(ava), await connect(ben), await connect(cleo)];

    const requested = benDevice.next();
    await client(ava).post('/api/friends/requests', { userId: ben.userId });
    const request1 = await requested;
    const accepted = avaDevice.next();
    await client(ben).post(`/api/friends/requests/${ava.userId}/accept`);
    const accept1 = await accepted;
    const unfriended = benDevice.next();
    await client(ava).delete(`/api/friends/${ben.userId}`);
    const removal = await unfriended;
    await client(cleo).post('/api/friends/requests', { userId: ava.userId });
    const declined = cleoDevice.next();
    await client(ava).delete(`/api/friends/${cleo.userId}`);
    const decline = await declined;
    await client(ben).post('/api/friends/requests', { userId: cleo.userId });
    const cancelled = cleoDevice.next();
    await client(ben).delete(`/api/friends/${cleo.userId}`);
    const cancel = await cancelled;
    await client(ava).post('/api/friends/requests', { userId: cleo.userId });
    const crossed = avaDevice.next();
    await client(cleo).post('/api/friends/requests', { userId: ava.userId });
    const cross = await crossed;

    expect(request1).toMatchObject({ type: 'friendRequest', actorId: ava.userId, text: 'Ava sent you a friend request' });
    expect(Number.isNaN(Date.parse(request1.at))).toBe(false);
    expect(accept1).toMatchObject({ type: 'friendAccepted', actorId: ben.userId, text: 'Ben accepted your friend request' });
    expect(removal).toMatchObject({ type: 'friendRemoved', actorId: ava.userId, text: 'Ava removed you as a friend' });
    expect(decline).toMatchObject({ type: 'friendRemoved', actorId: ava.userId, text: 'Ava declined your friend request' });
    expect(cancel).toMatchObject({ type: 'friendRemoved', actorId: ben.userId, text: 'Ben cancelled their friend request' });
    expect(cross).toMatchObject({ type: 'friendAccepted', actorId: cleo.userId, text: 'Cleo accepted your friend request' });
    expect(avaDevice.events.map((event) => event.actorId)).not.toContain(ava.userId);
    await close();
  });
});

// Interface Socket.io: liveEvent, after POST /api/groups/join, DELETE /api/groups/:groupId/members/:userId and
// DELETE /api/groups/:groupId
describe('Unmocked: Socket.io live events for groups', () => {
  // Input: Max and Tess join Noah's group "Crew"; Noah removes Max; Tess leaves; Max joins again and Noah deletes the group
  // Expected status code: none (Socket.io); the REST calls succeed
  // Expected behavior: the group's other members hear of each change; the removed member is told they were removed
  // Expected output: liveEvent memberJoined, removedFromGroup, memberLeft and groupDeleted with the group's id and text
  test('Joining, leaving, removals and deletion reach the members', async () => {
    const { authService, connect, client, close } = await liveApp();
    const noah = await signedInUser(authService, 'Noah Owner');
    const max = await signedInUser(authService, 'Max Member');
    const tess = await signedInUser(authService, 'Tess Third');
    const [noahDevice, maxDevice, tessDevice] = [await connect(noah), await connect(max), await connect(tess)];
    const group = (await client(noah).post('/api/groups', { name: 'Crew' })).body as GroupDto;

    const maxJoined = noahDevice.next();
    await client(max).post('/api/groups/join', { inviteCode: group.inviteCode });
    const joined = await maxJoined;
    const tessJoined = Promise.all([noahDevice.next(), maxDevice.next()]);
    await client(tess).post('/api/groups/join', { inviteCode: group.inviteCode });
    const joinedSeen = await tessJoined;
    const maxRemoved = Promise.all([maxDevice.next(), tessDevice.next()]);
    await client(noah).delete(`/api/groups/${group.id}/members/${max.userId}`);
    const [removedNotice, removedSeen] = await maxRemoved;
    const tessLeft = noahDevice.next();
    await client(tess).delete(`/api/groups/${group.id}/members/${tess.userId}`);
    const left = await tessLeft;
    await client(max).post('/api/groups/join', { inviteCode: group.inviteCode });
    const deleted = maxDevice.next();
    await client(noah).delete(`/api/groups/${group.id}`);
    const deletion = await deleted;

    expect(joined).toMatchObject({ type: 'memberJoined', actorId: max.userId, groupId: group.id, text: 'Max joined Crew' });
    expect(joinedSeen.map((event) => event.text)).toEqual(['Tess joined Crew', 'Tess joined Crew']);
    expect(removedNotice).toMatchObject({ type: 'removedFromGroup', actorId: noah.userId, groupId: group.id, text: 'Noah removed you from Crew' });
    expect(removedSeen).toMatchObject({ type: 'memberLeft', text: 'Noah removed Max from Crew' });
    expect(left).toMatchObject({ type: 'memberLeft', actorId: tess.userId, text: 'Tess left Crew' });
    expect(deletion).toMatchObject({ type: 'groupDeleted', actorId: noah.userId, groupId: group.id, text: 'Noah deleted Crew' });
    expect(noahDevice.events.map((event) => event.actorId)).not.toContain(noah.userId);
    await close();
  });
});

// Interface Socket.io: liveEvent, after POST /api/nearby/trips/:tripId/requests, POST /api/nearby/requests/:requestId/accept
// and POST /api/nearby/requests/:requestId/decline
describe('Unmocked: Socket.io live events for join requests', () => {
  // Input: Olivia opens her group's trip; Vera and Wes ask to join; Olivia accepts Vera and declines Wes
  // Expected status code: none (Socket.io); the REST calls succeed
  // Expected behavior: the owner hears of each request; each requester hears the answer; the group's member hears Vera join
  // Expected output: liveEvent joinRequest, joinAnswered (accepted and declined) and memberJoined
  test('Requests reach the owner and answers reach the traveller', async () => {
    const testApp = createTestApp({ now: () => TWO_DAYS_BEFORE });
    const { authService, activityService, connect, client, close } = await liveApp(testApp);
    await seedTestville(activityService);
    const olivia = await signedInUser(authService, 'Olivia Owner');
    const max = await signedInUser(authService, 'Max Member');
    const vera = await signedInUser(authService, 'Vera Visitor');
    const wes = await signedInUser(authService, 'Wes Wanderer');
    const group = (await client(olivia).post('/api/groups', { name: 'Testville crew' })).body as GroupDto;
    await client(max).post('/api/groups/join', { inviteCode: group.inviteCode });
    const tripId = await storeTestvilleTrip(olivia.userId, ['Morning Bakery', 'Harbour Park'], { groupId: group.id });
    await client(olivia).put(`/api/nearby/trips/${tripId}`, { openToJoin: true });
    const [oliviaDevice, maxDevice, veraDevice, wesDevice] = [await connect(olivia), await connect(max), await connect(vera), await connect(wes)];

    const asked = oliviaDevice.next();
    const veraRequest = (await client(vera).post(`/api/nearby/trips/${tripId}/requests`, { note: 'Hi!' })).body as JoinRequestDto;
    const ask = await asked;
    const answered = Promise.all([veraDevice.next(), maxDevice.next()]);
    await client(olivia).post(`/api/nearby/requests/${veraRequest.id}/accept`);
    const [acceptance, veraJoined] = await answered;
    const wesRequest = (await client(wes).post(`/api/nearby/trips/${tripId}/requests`, {})).body as JoinRequestDto;
    const declined = wesDevice.next();
    await client(olivia).post(`/api/nearby/requests/${wesRequest.id}/decline`);
    const decline = await declined;

    expect(ask).toMatchObject({ type: 'joinRequest', actorId: vera.userId, groupId: group.id, tripId, text: 'Vera asked to join Testville crew' });
    expect(acceptance).toMatchObject({ type: 'joinAnswered', actorId: olivia.userId, tripId, text: 'Olivia accepted your request to join Testville crew' });
    expect(veraJoined).toMatchObject({ type: 'memberJoined', actorId: vera.userId, text: 'Vera joined Testville crew' });
    expect(decline).toMatchObject({ type: 'joinAnswered', text: 'Olivia declined your request to join Testville crew' });
    await close();
  });
});

// Interface Socket.io: liveEvent, after PUT /api/posts/:postId/like and POST /api/posts/:postId/comments
describe('Unmocked: Socket.io live events for posts', () => {
  // Input: Ben likes Ava's post twice and comments on it; Ava likes and comments on her own post; then Ben comments again
  // Expected status code: none (Socket.io); the REST calls succeed
  // Expected behavior: Ava hears of Ben's first like and of each of his comments; liking twice and her own reactions add
  //                    nothing
  // Expected output: liveEvent postLiked, then postCommented twice, with the post's id
  test("Likes and comments reach the post's author", async () => {
    const { authService, activityService, connect, client, close } = await liveApp();
    await seedTestville(activityService);
    const ava = await signedInUser(authService, 'Ava Traveller');
    const ben = await signedInUser(authService, 'Ben Traveller');
    const tripId = await storeTestvilleTrip(ava.userId, ['Morning Bakery', 'Harbour Park']);
    const post = (await client(ava).post('/api/posts', { tripId, rating: 5 })).body as PostDetailDto;
    const avaDevice = await connect(ava);

    const liked = avaDevice.next();
    await client(ben).put(`/api/posts/${post.id}/like`);
    const like = await liked;
    await client(ben).put(`/api/posts/${post.id}/like`);
    await client(ava).put(`/api/posts/${post.id}/like`);
    await client(ava).post(`/api/posts/${post.id}/comments`, { text: 'Thanks!' });
    const commented = avaDevice.next();
    await client(ben).post(`/api/posts/${post.id}/comments`, { text: 'Great day' });
    const comment = await commented;

    expect(like).toMatchObject({ type: 'postLiked', actorId: ben.userId, postId: post.id, text: 'Ben liked your Testville trip' });
    expect(comment).toMatchObject({ type: 'postCommented', actorId: ben.userId, postId: post.id, text: 'Ben commented on your Testville trip' });
    expect(avaDevice.events.map((event) => event.type)).toEqual(['postLiked', 'postCommented']);
    await close();
  });
});

// Interface Socket.io: liveEvent, after the disruption timer makes a suggestion
describe('Unmocked: Socket.io live events for suggestions', () => {
  // Input: a suggestion for Harbour Park in the rain, on a group trip and on a personal trip
  // Expected status code: none (Socket.io)
  // Expected behavior: every member of the group trip, and the owner of the personal trip, hears of it, even with the trip
  //                    closed
  // Expected output: liveEvent suggestion with the trip's id and the problem in its text
  test("Suggestions reach the trip's members", async () => {
    const testApp = createTestApp({ now: () => new Date('2026-10-24T08:00:00Z') });
    const { authService, activityService, disruptionService, connect, client, close } = await liveApp(testApp);
    await seedTestville(activityService);
    const noah = await signedInUser(authService, 'Noah Owner');
    const max = await signedInUser(authService, 'Max Member');
    const group = (await client(noah).post('/api/groups', { name: 'Crew' })).body as GroupDto;
    await client(max).post('/api/groups/join', { inviteCode: group.inviteCode });
    const groupTrip = await storeTestvilleTrip(noah.userId, ['Morning Bakery', 'Harbour Park'], { groupId: group.id });
    const personalTrip = await storeTestvilleTrip(max.userId, ['Morning Bakery', 'Harbour Park']);
    const parkId = (await ActivityModel.findOne({ name: 'Harbour Park' }))?._id.toString() ?? '';
    const [noahDevice, maxDevice] = [await connect(noah), await connect(max)];

    const groupNotices = Promise.all([noahDevice.next(), maxDevice.next()]);
    await disruptionService.suggest(new Types.ObjectId(groupTrip), 0, parkId, 'rain');
    const [toNoah, toMax] = await groupNotices;
    const personalNotice = maxDevice.next();
    await disruptionService.suggest(new Types.ObjectId(personalTrip), 0, parkId, 'closed');
    const personal = await personalNotice;

    expect(toNoah).toMatchObject({ type: 'suggestion', actorId: '', tripId: groupTrip });
    expect(toNoah.text).toMatch(/^Rain is likely at \d\d:\d\d during Harbour Park\. There is a suggestion for your Testville trip\.$/);
    expect(toMax).toEqual(toNoah);
    expect(personal).toMatchObject({ type: 'suggestion', tripId: personalTrip, text: 'Harbour Park is closed. There is a suggestion for your Testville trip.' });
    expect(noahDevice.events).toHaveLength(1);
    await close();
  });
});
