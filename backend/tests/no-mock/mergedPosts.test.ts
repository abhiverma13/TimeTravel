import request from 'supertest';

import type { NotificationDto } from '../../src/notifications/notificationService';
import type { PostDetailDto, PostDto, TakerDto } from '../../src/posts/postService';
import type { TripDto } from '../../src/trips/tripService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

type Traveller = Awaited<ReturnType<typeof signedInUser>>;

// The Saturday a week after the Testville trip, so a copy keeps every stop.
const NEXT_SATURDAY = '2026-10-31';

/** Ava shares a Testville trip (rated 5); Ben, Cleo and Dan (whose account is private) can copy and share it. */
async function sharedTrip() {
  const { app, authService, activityService } = createTestApp();
  await seedTestville(activityService);
  const ava = await signedInUser(authService, 'Ava Planner');
  const ben = await signedInUser(authService, 'Ben Taker');
  const cleo = await signedInUser(authService, 'Cleo Viewer');
  const dan = await signedInUser(authService, 'Dan Private');
  const client = (user: Traveller) => ({
    get: (path: string) => request(app).get(path).set(user.authorization),
    post: (path: string, body: object = {}) => request(app).post(path).set(user.authorization).send(body),
    put: (path: string, body: object = {}) => request(app).put(path).set(user.authorization).send(body),
    delete: (path: string) => request(app).delete(path).set(user.authorization),
  });
  const tripId = await storeTestvilleTrip(ava.userId, ['Morning Bakery', 'Harbour Park']);
  const original = (await client(ava).post('/api/posts', { tripId, rating: 5, caption: 'My favourite day' })).body as PostDetailDto;
  const copy = async (user: Traveller, postId: string = original.id) =>
    (await client(user).post(`/api/posts/${postId}/copy`, { startDate: NEXT_SATURDAY })).body as TripDto;
  const share = async (user: Traveller, trip: TripDto, body: object) => client(user).post('/api/posts', { tripId: trip.id, ...body });
  const removeFirstStop = async (user: Traveller, trip: TripDto) =>
    client(user).post(`/api/trips/${trip.id}/adjust`, { action: 'remove', version: trip.version, dayIndex: 0, activityId: trip.days.at(0)?.stops.at(0)?.activityId });
  const feed = async (user: Traveller, which = 'everyone') => ((await client(user).get(`/api/posts?feed=${which}`)).body as { posts: PostDto[] }).posts;
  return { app, ava, ben, cleo, dan, client, original, copy, share, removeFirstStop, feed };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface POST /api/posts (a copied trip) and GET /api/posts
describe('Unmocked: POST /api/posts for a copied trip', () => {
  // Input: Ben copies Ava's shared trip and shares it unchanged, rated 3 with "Loved it"
  // Expected status code: 201
  // Expected behavior: Ben's post is linked to Ava's; the feed shows one card for the trip, Ava's, with both travellers
  //                    and their average rating; Ben's own posts still list his; Ava is told Ben took her trip
  // Expected output: Ben's post with original { postId, planner: Ava }; one feed card with takenBy 2 and averageRating 4;
  //                  a tripTaken notification for Ava
  test("An unchanged copy joins the original's card", async () => {
    const { ava, ben, cleo, client, original, copy, share, feed } = await sharedTrip();
    const bens = await copy(ben);

    const response = await share(ben, bens, { rating: 3, caption: 'Loved it' });

    const posted = response.body as PostDetailDto;
    expect(response.status).toBe(201);
    expect(posted.original).toEqual({ postId: original.id, planner: { id: ava.userId, name: 'Ava Planner' } });
    expect(posted.startDate).toBe(NEXT_SATURDAY);
    const cards = await feed(cleo);
    expect(cards.map((card) => card.id)).toEqual([original.id]);
    expect(cards.at(0)).toMatchObject({ takenBy: 2, averageRating: 4, rating: 5, original: null });
    const history = ((await client(ben).get(`/api/posts?authorId=${ben.userId}`)).body as { posts: PostDto[] }).posts;
    expect(history.map((post) => [post.id, post.original?.postId])).toEqual([[posted.id, original.id]]);
    const notices = ((await client(ava).get('/api/notifications')).body as { notifications: NotificationDto[] }).notifications;
    expect(notices.at(0)).toMatchObject({ type: 'tripTaken', area: 'feed', postId: original.id, text: 'Ben took your Testville trip' });
  });

  // Input: Ben removes a stop from his copy and shares it without saying whether to link back, then with
  //        linkToOriginal true; Cleo changes her copy and shares it with linkToOriginal false
  // Expected status code: 400, then 201 twice
  // Expected behavior: a changed copy must choose; linking puts it on the original's card, not linking gives it a card
  //                    of its own; locking a stop does not count as a change
  // Expected output: the error; Ava's card with takenBy 2; Cleo's own card
  test('A changed copy asks whether to link back to the original', async () => {
    const { ben, cleo, client, original, copy, share, removeFirstStop, feed } = await sharedTrip();
    const bens = await copy(ben);
    const locked = (await client(ben).post(`/api/trips/${bens.id}/adjust`, { action: 'lock', version: 0, dayIndex: 0, activityId: bens.days.at(0)?.stops.at(0)?.activityId })).body as TripDto;
    const changed = (await removeFirstStop(ben, locked)).body as TripDto;

    const undecided = await share(ben, changed, { rating: 4 });
    const linked = await share(ben, changed, { rating: 4, linkToOriginal: true });
    const cleos = await copy(cleo);
    await removeFirstStop(cleo, cleos);
    const separate = await share(cleo, cleos, { rating: 2, linkToOriginal: false });

    expect(locked.modifiedSinceCopy).toBe(false);
    expect(changed).toMatchObject({ modifiedSinceCopy: true, copiedFrom: { postId: original.id } });
    expect(undecided.status).toBe(400);
    expect(undecided.body).toEqual({ error: 'This trip changed since it was copied: say whether to link it back to the original (linkToOriginal)' });
    expect(linked.status).toBe(201);
    expect((linked.body as PostDetailDto).original?.postId).toBe(original.id);
    expect(separate.status).toBe(201);
    expect((separate.body as PostDetailDto).original).toBeNull();
    const cards = await feed(ben);
    expect(cards.map((card) => [card.id, card.takenBy])).toEqual([
      [(separate.body as PostDetailDto).id, 1],
      [original.id, 2],
    ]);
  });

  // Input: Cleo copies Ben's post, which is itself a linked copy of Ava's, and shares it unchanged
  // Expected status code: 201
  // Expected behavior: Cleo's post links to the first trip, Ava's, so all three share one card
  // Expected output: Cleo's post with original.postId of Ava's post; Ava's card with takenBy 3
  test('A copy of a copy links to the first trip', async () => {
    const { ben, cleo, original, copy, share, feed } = await sharedTrip();
    const bensPost = (await share(ben, await copy(ben), { rating: 4 })).body as PostDetailDto;

    const response = await share(cleo, await copy(cleo, bensPost.id), { rating: 3 });

    expect(response.status).toBe(201);
    expect((response.body as PostDetailDto).original?.postId).toBe(original.id);
    expect((await feed(cleo)).map((card) => [card.id, card.takenBy, card.averageRating])).toEqual([[original.id, 3, 4]]);
  });

  // Input: Cleo is friends with Ben, not with Ava; Ben takes Ava's trip; Dan has no friends
  // Expected status code: 200
  // Expected behavior: a friend taking a trip brings its card to the Friends feed; strangers' cards stay out
  // Expected output: Cleo's Friends feed has Ava's card; Dan's is empty
  test('The Friends feed shows the trips friends took', async () => {
    const { ben, cleo, dan, client, original, copy, share, feed } = await sharedTrip();
    await client(cleo).post('/api/friends/requests', { userId: ben.userId });
    await client(ben).post(`/api/friends/requests/${cleo.userId}/accept`);
    await share(ben, await copy(ben), { rating: 4 });

    expect((await feed(cleo, 'friends')).map((card) => card.id)).toEqual([original.id]);
    expect(await feed(dan, 'friends')).toEqual([]);
  });

  // Input: Ben's unchanged copy is linked to Ava's post; Ava deletes her post
  // Expected status code: 204
  // Expected behavior: Ben's post becomes a post of its own and shows on the feed with his trip
  // Expected output: one card, Ben's, with original null and takenBy 1
  test("Deleting the original makes its copies posts of their own", async () => {
    const { ava, ben, client, original, copy, share, feed } = await sharedTrip();
    const bensPost = (await share(ben, await copy(ben), { rating: 3 })).body as PostDetailDto;

    const response = await client(ava).delete(`/api/posts/${original.id}`);

    expect(response.status).toBe(204);
    expect((await feed(ben)).map((card) => [card.id, card.original, card.takenBy])).toEqual([[bensPost.id, null, 1]]);
  });
});

// Interface GET /api/posts/:postId/takers
describe('Unmocked: GET /api/posts/:postId/takers', () => {
  // Input: Ben (public) and Dan (private, a stranger to Cleo) take Ava's trip; Cleo asks who took it, from Ava's post and
  //        from Ben's
  // Expected status code: 200 both times
  // Expected behavior: the planner first, then each traveller Cleo may see, with their rating and caption; private
  //                    strangers are only counted
  // Expected output: Ava (planner, 5) and Ben (4, "Worth it"), hiddenCount 1; the same list from Ben's post
  test('Lists who took the trip, with their ratings and captions', async () => {
    const { ava, ben, cleo, dan, client, original, copy, share } = await sharedTrip();
    const bensPost = (await share(ben, await copy(ben), { rating: 4, caption: 'Worth it' })).body as PostDetailDto;
    await share(dan, await copy(dan), { rating: 1, caption: 'Too much walking' });
    await client(dan).put('/api/friends/privacy', { isPrivate: true });

    const fromOriginal = await client(cleo).get(`/api/posts/${original.id}/takers`);
    const fromCopy = await client(cleo).get(`/api/posts/${bensPost.id}/takers`);

    const body = fromOriginal.body as { takers: TakerDto[]; hiddenCount: number };
    expect(fromOriginal.status).toBe(200);
    expect(body.takers.map((taker) => [taker.traveller.id, taker.planner, taker.rating, taker.caption])).toEqual([
      [ava.userId, true, 5, 'My favourite day'],
      [ben.userId, false, 4, 'Worth it'],
    ]);
    expect(body.hiddenCount).toBe(1);
    expect(fromCopy.body).toEqual(fromOriginal.body);
  });

  // Input: no session, and a post id that does not exist
  // Expected status code: 401, then 404
  // Expected behavior: nothing is listed
  // Expected output: an error message each time
  test('Requires a session and a post the caller may see', async () => {
    const { app, cleo, client } = await sharedTrip();

    const anonymous = await request(app).get('/api/posts/64b7f0c2a1b2c3d4e5f60718/takers');
    const unknown = await client(cleo).get('/api/posts/64b7f0c2a1b2c3d4e5f60718/takers');

    expect(anonymous.status).toBe(401);
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: 'Post not found' });
  });
});
