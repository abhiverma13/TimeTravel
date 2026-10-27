import request from 'supertest';
import { io } from 'socket.io-client';

import type { GroupDto } from '../../src/groups/groupService';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import type { MemberLocation } from '../../src/sync/tripSync';
import { connectClient, nextUpdate, startLiveServer, subscribeTo } from '../helpers/liveServer';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

/** A Testville group trip shared by an owner and a member, served with live updates. */
async function sharedTrip() {
  const testApp = createTestApp();
  const owner = await signedInUser(testApp.authService, 'Noah Owner');
  const member = await signedInUser(testApp.authService, 'Ava Member');
  const outsider = await signedInUser(testApp.authService, 'Outsider');
  await seedTestville(testApp.activityService);
  const group = (await request(testApp.app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
  await request(testApp.app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
  const itineraryId = await storeTestvilleTrip(owner.userId, ['Morning Bakery', 'Harbour Park'], { groupId: group.id });
  const itinerary = (await request(testApp.app).get(`/api/itineraries/${itineraryId}`).set(owner.authorization)).body as ItineraryDto;
  const live = await startLiveServer(testApp);
  const removePark = () =>
    request(testApp.app)
      .post(`/api/itineraries/${itineraryId}/adjust`)
      .set(owner.authorization)
      .send({ action: 'remove', version: 0, dayIndex: 0, activityId: itinerary.days.at(0)?.stops.at(1)?.activityId });
  return { ...testApp, owner, member, outsider, itineraryId, live, removePark };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface Socket.io: subscribe { itineraryId } and itineraryUpdated { itinerary, actorId, summary }
describe('Unmocked: Socket.io itinerary updates', () => {
  // Input: the owner and a member subscribe to their group trip; the owner removes Harbour Park
  // Expected status code: none (Socket.io); the subscriptions are acknowledged with { ok: true }
  // Expected behavior: both devices receive the new plan as soon as it is saved
  // Expected output: itineraryUpdated with version 1, without Harbour Park, and the summary "Noah removed Harbour Park"
  test('Every subscribed member receives an adjustment', async () => {
    const { owner, member, itineraryId, live, removePark } = await sharedTrip();
    const ownerSocket = await connectClient(live.url, owner.authorization);
    const memberSocket = await connectClient(live.url, member.authorization);

    const replies = [await subscribeTo(ownerSocket, itineraryId), await subscribeTo(memberSocket, itineraryId)];
    const updates = Promise.all([nextUpdate(ownerSocket), nextUpdate(memberSocket)]);
    await removePark();
    const [toOwner, toMember] = await updates;

    expect(replies).toEqual([{ ok: true }, { ok: true }]);
    expect(toMember.summary).toBe('Noah removed Harbour Park');
    expect(toMember.actorId).toBe(owner.userId);
    expect(toMember.itinerary.version).toBe(1);
    expect(toMember.itinerary.days.at(0)?.stops.map((stop) => stop.name)).not.toContain('Harbour Park');
    expect(toOwner).toEqual(toMember);
    ownerSocket.disconnect();
    memberSocket.disconnect();
    await live.close();
  });

  // Input: a traveller outside the group subscribes to the group's trip, then a payload without an itinerary id
  // Expected status code: none; both subscriptions are acknowledged with { ok: false }
  // Expected behavior: the outsider receives nothing when the trip changes
  // Expected output: { ok: false, error: "Itinerary not found" } and { ok: false, error: "Send { itineraryId } to subscribe" }
  test('Subscriptions to trips you cannot see are refused', async () => {
    const { outsider, itineraryId, live, removePark } = await sharedTrip();
    const socket = await connectClient(live.url, outsider.authorization);
    const received = jest.fn();
    socket.on('itineraryUpdated', received);

    const refused = await subscribeTo(socket, itineraryId);
    const malformed = await socket.emitWithAck('subscribe', { trip: itineraryId });
    await removePark();

    expect(refused).toEqual({ ok: false, error: 'Itinerary not found' });
    expect(malformed).toEqual({ ok: false, error: 'Send { itineraryId } to subscribe' });
    expect(received).not.toHaveBeenCalled();
    socket.disconnect();
    await live.close();
  });

  // Input: a member subscribes, then unsubscribes, before the owner removes a stop
  // Expected status code: none
  // Expected behavior: after unsubscribing, the member's device stops receiving that trip's updates
  // Expected output: no itineraryUpdated message for the member
  test('Unsubscribing stops the updates', async () => {
    const { owner, member, itineraryId, live, removePark } = await sharedTrip();
    const ownerSocket = await connectClient(live.url, owner.authorization);
    const memberSocket = await connectClient(live.url, member.authorization);
    await subscribeTo(ownerSocket, itineraryId);
    await subscribeTo(memberSocket, itineraryId);
    const received = jest.fn();
    memberSocket.on('itineraryUpdated', received);

    memberSocket.emit('unsubscribe', { itineraryId });
    memberSocket.emit('unsubscribe', 'not an object');
    await subscribeTo(memberSocket, 'round-trip-so-the-unsubscribes-are-processed');
    const ownerUpdate = nextUpdate(ownerSocket);
    await removePark();
    await ownerUpdate;

    expect(received).not.toHaveBeenCalled();
    ownerSocket.disconnect();
    memberSocket.disconnect();
    await live.close();
  });

  // Input: connections with a forged session token and with none, and a subscribe sent without an acknowledgement
  // Expected status code: none; the forged and missing tokens are rejected during the handshake
  // Expected behavior: unauthenticated devices never connect; a subscribe without an acknowledgement is still handled
  // Expected output: connect_error "Invalid or expired session token" for both
  test('Connections without a valid session are refused', async () => {
    const { owner, itineraryId, live } = await sharedTrip();
    const forged = io(live.url, { auth: { token: 'forged' }, transports: ['websocket'], reconnection: false });
    const missing = io(live.url, { transports: ['websocket'], reconnection: false });

    const errors = await Promise.all(
      [forged, missing].map(async (socket) => new Promise<Error>((resolve) => socket.once('connect_error', resolve))),
    );
    const valid = await connectClient(live.url, owner.authorization);
    valid.emit('subscribe', { itineraryId });
    const stillWorks = await subscribeTo(valid, itineraryId);

    expect(errors.map((error) => error.message)).toEqual(['Invalid or expired session token', 'Invalid or expired session token']);
    expect(stillWorks).toEqual({ ok: true });
    valid.disconnect();
    await live.close();
  });
});

async function nextEvent<T>(socket: ReturnType<typeof io>, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
}

// Interface Socket.io: shareLocation { itineraryId, lat, lng }, stopSharingLocation { itineraryId }, and
// memberLocation / memberLocationStopped
describe('Unmocked: Socket.io location sharing', () => {
  // Input: the owner and a member subscribe to their group trip; the owner shares { lat: 49.2827, lng: -123.1207 }
  // Expected status code: none; the share is acknowledged with { ok: true }
  // Expected behavior: the other members receive the position at once; the sharer does not get it back
  // Expected output: memberLocation with the owner's id and name, the position and the time
  test("Members see each other's shared location", async () => {
    const { owner, member, itineraryId, live } = await sharedTrip();
    const ownerSocket = await connectClient(live.url, owner.authorization);
    const memberSocket = await connectClient(live.url, member.authorization);
    await subscribeTo(ownerSocket, itineraryId);
    await subscribeTo(memberSocket, itineraryId);
    const echoed = jest.fn();
    ownerSocket.on('memberLocation', echoed);

    const arriving = nextEvent<MemberLocation>(memberSocket, 'memberLocation');
    const reply = await ownerSocket.emitWithAck('shareLocation', { itineraryId, lat: 49.2827, lng: -123.1207 });
    const location = await arriving;

    expect(reply).toEqual({ ok: true });
    expect(location).toMatchObject({ itineraryId, userId: owner.userId, name: 'Noah Owner', lat: 49.2827, lng: -123.1207 });
    expect(Number.isNaN(Date.parse(location.at))).toBe(false);
    expect(echoed).not.toHaveBeenCalled();
    ownerSocket.disconnect();
    memberSocket.disconnect();
    await live.close();
  });

  // Input: the owner shares their location, then stops; shares again, then disconnects
  // Expected status code: none
  // Expected behavior: the other members are told each time the owner's position goes away
  // Expected output: memberLocationStopped { itineraryId, userId } twice
  test('Stopping or leaving tells the other members', async () => {
    const { owner, member, itineraryId, live } = await sharedTrip();
    const ownerSocket = await connectClient(live.url, owner.authorization);
    const memberSocket = await connectClient(live.url, member.authorization);
    await subscribeTo(ownerSocket, itineraryId);
    await subscribeTo(memberSocket, itineraryId);

    await ownerSocket.emitWithAck('shareLocation', { itineraryId, lat: 49.28, lng: -123.12 });
    const stopped = nextEvent(memberSocket, 'memberLocationStopped');
    ownerSocket.emit('stopSharingLocation', { itineraryId });
    const first = await stopped;
    await ownerSocket.emitWithAck('shareLocation', { itineraryId, lat: 49.28, lng: -123.12 });
    const left = nextEvent(memberSocket, 'memberLocationStopped');
    ownerSocket.disconnect();
    const second = await left;

    expect(first).toEqual({ itineraryId, userId: owner.userId });
    expect(second).toEqual({ itineraryId, userId: owner.userId });
    memberSocket.disconnect();
    await live.close();
  });

  // Input: a share before subscribing, a latitude of 91, a share without an acknowledgement, and a stop for a trip the
  //        device never shared with
  // Expected status code: none; the refused shares are acknowledged with { ok: false }
  // Expected behavior: nothing reaches the other members
  // Expected output: the matching error for each refused share
  test('Shares that are refused', async () => {
    const { owner, member, itineraryId, live } = await sharedTrip();
    const ownerSocket = await connectClient(live.url, owner.authorization);
    const memberSocket = await connectClient(live.url, member.authorization);
    await subscribeTo(memberSocket, itineraryId);
    const received = jest.fn();
    memberSocket.on('memberLocation', received);
    memberSocket.on('memberLocationStopped', received);

    const notSubscribed = await ownerSocket.emitWithAck('shareLocation', { itineraryId, lat: 49.28, lng: -123.12 });
    await subscribeTo(ownerSocket, itineraryId);
    const offTheMap = await ownerSocket.emitWithAck('shareLocation', { itineraryId, lat: 91, lng: -123.12 });
    ownerSocket.emit('shareLocation', { itineraryId, lat: 'here' });
    ownerSocket.emit('stopSharingLocation', { itineraryId });
    ownerSocket.emit('stopSharingLocation', 'not an object');
    await subscribeTo(ownerSocket, itineraryId);

    expect(notSubscribed).toEqual({ ok: false, error: 'Subscribe to the itinerary before sharing your location' });
    expect(offTheMap).toEqual({ ok: false, error: 'Send { itineraryId, lat, lng } to share your location' });
    expect(received).not.toHaveBeenCalled();
    ownerSocket.disconnect();
    memberSocket.disconnect();
    await live.close();
  });
});
