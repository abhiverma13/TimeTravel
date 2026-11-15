import { Types } from 'mongoose';
import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import type { GroupDto } from '../../src/groups/groupService';
import { NotificationModel } from '../../src/notifications/notificationModel';
import { NOTIFICATION_LIST_LIMIT, type NotificationDto, type UnreadCounts } from '../../src/notifications/notificationService';
import type { PostDetailDto } from '../../src/posts/postService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

type Traveller = Awaited<ReturnType<typeof signedInUser>>;

interface NotificationList {
  notifications: NotificationDto[];
  unread: UnreadCounts;
}

/** Ava, who gets one notification in each area from Ben: a suggestion, a member joining, a like and a friend request. */
async function busyAva() {
  const testApp = createTestApp({ now: () => new Date('2026-10-24T08:00:00Z') });
  const { app, authService, activityService, disruptionService } = testApp;
  await seedTestville(activityService);
  const ava = await signedInUser(authService, 'Ava Traveller');
  const ben = await signedInUser(authService, 'Ben Traveller');
  const client = (user: Traveller) => ({
    get: (path: string) => request(app).get(path).set(user.authorization),
    post: (path: string, body?: object) => request(app).post(path).set(user.authorization).send(body),
    put: (path: string) => request(app).put(path).set(user.authorization),
  });
  const tripId = await storeTestvilleTrip(ava.userId, ['Morning Bakery', 'Harbour Park']);
  const parkId = (await ActivityModel.findOne({ name: 'Harbour Park' }))?._id.toString() ?? '';
  await disruptionService.suggest(new Types.ObjectId(tripId), 0, parkId, 'rain');
  const group = (await client(ava).post('/api/groups', { name: 'Crew' })).body as GroupDto;
  await client(ben).post('/api/groups/join', { inviteCode: group.inviteCode });
  const post = (await client(ava).post('/api/posts', { tripId, rating: 5 })).body as PostDetailDto;
  await client(ben).put(`/api/posts/${post.id}/like`);
  await client(ben).post('/api/friends/requests', { userId: ava.userId });
  return { ...testApp, ava, ben, client, tripId, group, post };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface GET /api/notifications
describe('Unmocked: GET /api/notifications', () => {
  // Input: Ava's session, after a suggestion for her trip, Ben joining her group, liking her post and asking to be friends
  // Expected status code: 200
  // Expected behavior: her notifications are listed newest first, each with its area, and counted unread per area
  // Expected output: four unread notifications (profile, feed, groups, trips) and one unread in each area
  test("Lists the traveller's newest notifications and the unread count per area", async () => {
    const { ava, ben, client, tripId, group, post } = await busyAva();

    const response = await client(ava).get('/api/notifications');

    const body = response.body as NotificationList;
    expect(response.status).toBe(200);
    expect(body.notifications.map((notification) => [notification.type, notification.area])).toEqual([
      ['friendRequest', 'profile'],
      ['postLiked', 'feed'],
      ['memberJoined', 'groups'],
      ['suggestion', 'trips'],
    ]);
    expect(body.notifications.at(0)).toMatchObject({ actorId: ben.userId, text: 'Ben sent you a friend request', read: false, groupId: null });
    expect(body.notifications.at(1)).toMatchObject({ postId: post.id, text: 'Ben liked your Testville trip' });
    expect(body.notifications.at(2)).toMatchObject({ groupId: group.id, text: 'Ben joined Crew' });
    expect(body.notifications.at(3)).toMatchObject({ tripId, actorId: '' });
    expect(body.unread).toEqual({ trips: 1, groups: 1, feed: 1, profile: 1 });
  });

  // Input: Ben's session (he caused every event, so got none) and a traveller with more than 30 notifications
  // Expected status code: 200
  // Expected behavior: a traveller sees only their own notifications, and at most the newest 30
  // Expected output: Ben's list is empty with no unread; the busy traveller's list has 30 entries
  test('Lists only the traveller\'s own, and at most 30', async () => {
    const { ben, client } = await busyAva();
    const busy = await signedInUser(createTestApp().authService, 'Busy Traveller');
    await NotificationModel.insertMany(
      Array.from({ length: NOTIFICATION_LIST_LIMIT + 1 }, (_, index) => ({
        userId: new Types.ObjectId(busy.userId),
        type: 'postLiked',
        area: 'feed',
        text: `Like ${String(index)}`,
        createdAt: new Date(Date.UTC(2026, 9, 1, 0, index)),
      })),
    );

    const bens = (await client(ben).get('/api/notifications')).body as NotificationList;
    const busys = (await client(busy).get('/api/notifications')).body as NotificationList;

    expect(bens).toEqual({ notifications: [], unread: { trips: 0, groups: 0, feed: 0, profile: 0 } });
    expect(busys.notifications).toHaveLength(NOTIFICATION_LIST_LIMIT);
    expect(busys.notifications.at(0)?.text).toBe(`Like ${String(NOTIFICATION_LIST_LIMIT)}`);
    expect(busys.unread.feed).toBe(NOTIFICATION_LIST_LIMIT + 1);
  });

  // Input: no session
  // Expected status code: 401
  // Expected behavior: nothing is returned
  // Expected output: an error message
  test('Requires a session', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/notifications');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
  });
});

// Interface POST /api/notifications/read
describe('Unmocked: POST /api/notifications/read', () => {
  // Input: Ava marks her Groups notifications read, then everything
  // Expected status code: 200 both times
  // Expected behavior: only the chosen area is marked read the first time; every notification the second time
  // Expected output: the unread counts left after each call; every notification listed as read at the end
  test('Marks one area read, or every area', async () => {
    const { ava, client } = await busyAva();

    const groups = await client(ava).post('/api/notifications/read', { area: 'groups' });
    const all = await client(ava).post('/api/notifications/read');
    const after = (await client(ava).get('/api/notifications')).body as NotificationList;

    expect(groups.status).toBe(200);
    expect(groups.body).toEqual({ unread: { trips: 1, groups: 0, feed: 1, profile: 1 } });
    expect(all.status).toBe(200);
    expect(all.body).toEqual({ unread: { trips: 0, groups: 0, feed: 0, profile: 0 } });
    expect(after.notifications.every((notification) => notification.read)).toBe(true);
  });

  // Input: an area that does not exist, and no session
  // Expected status code: 400, then 401
  // Expected behavior: nothing is marked read
  // Expected output: an error message each time
  test('Refuses an unknown area or a missing session', async () => {
    const { app, ava, client } = await busyAva();

    const unknown = await client(ava).post('/api/notifications/read', { area: 'explore' });
    const anonymous = await request(app).post('/api/notifications/read').send({ area: 'groups' });

    expect(unknown.status).toBe(400);
    expect(unknown.body).toHaveProperty('error');
    expect(anonymous.status).toBe(401);
    expect(await NotificationModel.countDocuments({ read: true })).toBe(0);
  });
});
