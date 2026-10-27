import { Types } from 'mongoose';
import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import { CommentModel, PostModel } from '../../src/posts/postModel';
import type { CommentDto, LikeState, PostDetailDto, PostDto } from '../../src/posts/postService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

type Traveller = Awaited<ReturnType<typeof signedInUser>>;

const AVA_TRIP = ['Morning Bakery', 'Harbour Park', 'Town Museum'];

// Testville, three signed-in travellers, and helpers to call the API as any of them.
async function sharing() {
  const { app, authService, activityService } = createTestApp();
  await seedTestville(activityService);
  const ava = await signedInUser(authService, 'Ava Traveller');
  const ben = await signedInUser(authService, 'Ben Traveller');
  const cleo = await signedInUser(authService, 'Cleo Traveller');
  const client = (user: Traveller) => ({
    get: (path: string) => request(app).get(path).set(user.authorization),
    post: (path: string, body: object = {}) => request(app).post(path).set(user.authorization).send(body),
    put: (path: string, body: object = {}) => request(app).put(path).set(user.authorization).send(body),
    delete: (path: string) => request(app).delete(path).set(user.authorization),
  });
  // Stores a Testville trip for the traveller and shares it with a 5-star rating.
  const share = async (user: Traveller, stops: string[] = AVA_TRIP) => {
    const itineraryId = await storeTestvilleTrip(user.userId, stops);
    return (await client(user).post('/api/posts', { itineraryId, rating: 5 })).body as PostDetailDto;
  };
  const befriend = async (one: Traveller, other: Traveller) => {
    await client(one).post('/api/friends/requests', { userId: other.userId });
    await client(other).post(`/api/friends/requests/${one.userId}/accept`);
  };
  const makePrivate = async (user: Traveller) => client(user).put('/api/friends/privacy', { isPrivate: true });
  return { app, ava, ben, cleo, client, share, befriend, makePrivate };
}

function stopNames(post: PostDetailDto): string[] {
  return post.trip.days.flatMap((day) => day.stops.map((stop) => stop.name));
}

function feed(response: request.Response): PostDto[] {
  return (response.body as { posts: PostDto[] }).posts;
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface POST /api/posts
describe('Unmocked: POST /api/posts', () => {
  // Input: Ava shares her one-day Testville trip with { rating: 4, caption: "  Great day out  " }, then removes a stop from it
  // Expected status code: 201
  // Expected behavior: the post keeps a frozen copy of the trip, so later changes to the itinerary do not change it
  // Expected output: the post with Ava as author, the trimmed caption, 1 day and 3 stops, before and after the change
  test('Shares a frozen copy of a trip', async () => {
    const { ava, client } = await sharing();
    const itineraryId = await storeTestvilleTrip(ava.userId, AVA_TRIP);

    const response = await client(ava).post('/api/posts', { itineraryId, rating: 4, caption: '  Great day out  ' });
    const itinerary = (await client(ava).get(`/api/itineraries/${itineraryId}`)).body as ItineraryDto;
    await client(ava).post(`/api/itineraries/${itineraryId}/adjust`, {
      action: 'remove',
      version: 0,
      dayIndex: 0,
      activityId: itinerary.days.at(0)?.stops.at(0)?.activityId,
    });
    const later = (await client(ava).get(`/api/posts/${(response.body as PostDetailDto).id}`)).body as PostDetailDto;

    const post = response.body as PostDetailDto;
    expect(response.status).toBe(201);
    expect(post).toMatchObject({
      author: { id: ava.userId, name: 'Ava Traveller' },
      city: 'Testville',
      startDate: '2026-10-24',
      endDate: '2026-10-24',
      dayCount: 1,
      stopCount: 3,
      rating: 4,
      caption: 'Great day out',
      likeCount: 0,
      likedByMe: false,
      commentCount: 0,
      mine: true,
    });
    expect(stopNames(post)).toEqual(AVA_TRIP);
    expect(stopNames(later)).toEqual(AVA_TRIP);
  });

  // Input: Ben shares Ava's personal trip, and Ava shares a trip with no stops
  // Expected status code: 404 and 422
  // Expected behavior: nothing is posted
  // Expected output: the matching error
  test.each([
    ['someone else\'s trip', 404, 'Itinerary not found'],
    ['a trip with no stops', 422, 'This trip has no stops to share'],
  ])('Share refused: %s', async (scenario, status, error) => {
    const { ava, ben, client } = await sharing();
    const itineraryId = await storeTestvilleTrip(ava.userId, scenario === 'a trip with no stops' ? [] : AVA_TRIP);
    const sharer = scenario === 'a trip with no stops' ? ava : ben;

    const response = await client(sharer).post('/api/posts', { itineraryId, rating: 5 });

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error });
    expect(await PostModel.countDocuments()).toBe(0);
  });

  // Input: ratings 0, 6 and 4.5, a 501-character caption, and no itinerary id
  // Expected status code: 400 for each
  // Expected behavior: nothing is posted
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, { caption: 'x'.repeat(501) }, { itineraryId: undefined }])(
    'Invalid post %p',
    async (change) => {
      const { ava, client } = await sharing();
      const itineraryId = await storeTestvilleTrip(ava.userId, AVA_TRIP);

      const response = await client(ava).post('/api/posts', { itineraryId, rating: 5, ...change });

      expect(response.status).toBe(400);
      expect((response.body as { error: string }).error).toBe('Invalid request');
    },
  );

  // Input: a post without an Authorization header
  // Expected status code: 401
  // Expected behavior: nothing is posted
  // Expected output: { error: "Missing session token" }
  test('Not signed in', async () => {
    const { app } = await sharing();

    const response = await request(app).post('/api/posts').send({ itineraryId: '64b7f0c2a1b2c3d4e5f60718', rating: 5 });

    expect(response.status).toBe(401);
  });
});

// Interface GET /api/posts
describe('Unmocked: GET /api/posts', () => {
  // Input: Cleo's everyone and friends feeds; Ava (public) and Ben (private, not Cleo's friend) posted, and Cleo
  //        posted after becoming friends with Ava
  // Expected status code: 200 for both
  // Expected behavior: everyone shows every post but private strangers'; friends shows friends' and Cleo's own
  // Expected output: everyone [Cleo, Ava]; friends [Cleo, Ava] after Ava and Cleo are friends, [Cleo] before
  test('Everyone and friends feeds', async () => {
    const { ava, ben, cleo, client, share, befriend, makePrivate } = await sharing();
    await makePrivate(ben);
    await share(ava);
    await share(ben);
    await share(cleo);

    const everyone = await client(cleo).get('/api/posts?feed=everyone');
    const friendsBefore = await client(cleo).get('/api/posts?feed=friends');
    await befriend(ava, cleo);
    const friendsAfter = await client(cleo).get('/api/posts?feed=friends');

    expect(everyone.status).toBe(200);
    expect(feed(everyone).map((post) => post.author.name)).toEqual(['Cleo Traveller', 'Ava Traveller']);
    expect(feed(friendsBefore).map((post) => post.author.name)).toEqual(['Cleo Traveller']);
    expect(feed(friendsAfter).map((post) => post.author.name)).toEqual(['Cleo Traveller', 'Ava Traveller']);
  });

  // Input: Ben's account is private; Cleo asks for the everyone feed before and after they become friends
  // Expected status code: 200
  // Expected behavior: a private account's posts reach its friends only
  // Expected output: no posts, then Ben's post
  test("A private account's posts reach its friends", async () => {
    const { ben, cleo, client, share, befriend, makePrivate } = await sharing();
    await makePrivate(ben);
    await share(ben);

    const before = await client(cleo).get('/api/posts');
    await befriend(ben, cleo);
    const after = await client(cleo).get('/api/posts');

    expect(feed(before)).toEqual([]);
    expect(feed(after).map((post) => post.author.name)).toEqual(['Ben Traveller']);
  });

  // Input: city "TESTVILLE" and city "Vancouver"; then authorId Ava and authorId Ben (private, not Cleo's friend)
  // Expected status code: 200 for each
  // Expected behavior: the city filter ignores case; one traveller's posts are listed only if the caller may see them
  // Expected output: [Ava's post], [], [Ava's post], []
  test('Filters by city and by author', async () => {
    const { ava, ben, cleo, client, share, makePrivate } = await sharing();
    await makePrivate(ben);
    const avaPost = await share(ava);
    await share(ben);

    const testville = await client(cleo).get('/api/posts?city=TESTVILLE');
    const vancouver = await client(cleo).get('/api/posts?city=Vancouver');
    const byAva = await client(cleo).get(`/api/posts?authorId=${ava.userId}`);
    const byBen = await client(cleo).get(`/api/posts?authorId=${ben.userId}`);

    expect(feed(testville).map((post) => post.id)).toEqual([avaPost.id]);
    expect(feed(vancouver)).toEqual([]);
    expect(feed(byAva).map((post) => post.id)).toEqual([avaPost.id]);
    expect(feed(byBen)).toEqual([]);
  });

  // Input: two posts an hour apart; the feed, then the feed before the newer post's time
  // Expected status code: 200 for both
  // Expected behavior: posts come newest first, and `before` gives the next page
  // Expected output: [newer, older], then [older]
  test('Pages newest first', async () => {
    const { ava, client, share } = await sharing();
    const older = await share(ava);
    const newer = await share(ava);
    await PostModel.collection.updateOne({ _id: new Types.ObjectId(older.id) }, { $set: { createdAt: new Date('2026-10-01T10:00:00Z') } });
    await PostModel.collection.updateOne({ _id: new Types.ObjectId(newer.id) }, { $set: { createdAt: new Date('2026-10-01T11:00:00Z') } });

    const first = await client(ava).get('/api/posts');
    const next = await client(ava).get('/api/posts?before=2026-10-01T11:00:00.000Z');

    expect(feed(first).map((post) => post.id)).toEqual([newer.id, older.id]);
    expect(feed(next).map((post) => post.id)).toEqual([older.id]);
  });

  // Input: feed "strangers", before "yesterday", and an authorId that is not an id
  // Expected status code: 400 for each
  // Expected behavior: nothing is listed
  // Expected output: { error: "Invalid request", details: [...] }
  test.each(['feed=strangers', 'before=yesterday', 'authorId=not-an-id'])('Invalid feed query %p', async (query) => {
    const { ava, client } = await sharing();

    const response = await client(ava).get(`/api/posts?${query}`);

    expect(response.status).toBe(400);
  });
});

// Interface GET /api/posts/:postId
describe('Unmocked: GET /api/posts/:postId', () => {
  // Input: Ben's account is private; his friend Ava opens his post
  // Expected status code: 200
  // Expected behavior: friends may read a private account's posts in full
  // Expected output: the post with its trip: day hours, pace, lodging and timed stops
  test('Reads a post with its trip', async () => {
    const { ava, ben, client, share, befriend, makePrivate } = await sharing();
    await makePrivate(ben);
    await befriend(ava, ben);
    const post = await share(ben);

    const response = await client(ava).get(`/api/posts/${post.id}`);

    const read = response.body as PostDetailDto;
    expect(response.status).toBe(200);
    expect(read).toMatchObject({ id: post.id, mine: false, trip: { dayStart: '09:00', dayEnd: '18:00', pace: 'moderate', lodging: 'Testville centre' } });
    expect(stopNames(read)).toEqual(AVA_TRIP);
  });

  // Input: a private stranger's post, an id no post has, and an id that is not an id
  // Expected status code: 404 for each
  // Expected behavior: nothing is revealed
  // Expected output: { error: "Post not found" }
  test.each(['private stranger', 'unknown', 'malformed'])('Hidden or missing post: %s', async (scenario) => {
    const { ben, cleo, client, share, makePrivate } = await sharing();
    await makePrivate(ben);
    const post = await share(ben);
    const postId = new Map([['private stranger', post.id], ['unknown', '64b7f0c2a1b2c3d4e5f60718'], ['malformed', 'not-an-id']]).get(scenario);

    const response = await client(cleo).get(`/api/posts/${postId ?? ''}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Post not found' });
  });
});

// Interface DELETE /api/posts/:postId
describe('Unmocked: DELETE /api/posts/:postId', () => {
  // Input: Ava deletes her post, which Ben commented on
  // Expected status code: 204
  // Expected behavior: the post and its comments are deleted
  // Expected output: no body
  test('The author deletes a post', async () => {
    const { ava, ben, client, share } = await sharing();
    const post = await share(ava);
    await client(ben).post(`/api/posts/${post.id}/comments`, { text: 'Looks fun' });

    const response = await client(ava).delete(`/api/posts/${post.id}`);

    expect(response.status).toBe(204);
    expect(await PostModel.countDocuments()).toBe(0);
    expect(await CommentModel.countDocuments()).toBe(0);
  });

  // Input: Ben deletes Ava's post, then a post that does not exist
  // Expected status code: 403, then 404
  // Expected behavior: nothing is deleted
  // Expected output: the matching error
  test('Only the author can delete a post', async () => {
    const { ava, ben, client, share } = await sharing();
    const post = await share(ava);

    const notTheirs = await client(ben).delete(`/api/posts/${post.id}`);
    const missing = await client(ben).delete('/api/posts/64b7f0c2a1b2c3d4e5f60718');

    expect(notTheirs.status).toBe(403);
    expect(notTheirs.body).toEqual({ error: 'Only the author can delete this post' });
    expect(missing.status).toBe(404);
    expect(await PostModel.countDocuments()).toBe(1);
  });
});

// Interface PUT /api/posts/:postId/like
describe('Unmocked: PUT /api/posts/:postId/like', () => {
  // Input: Ben likes Ava's post twice
  // Expected status code: 200 for both
  // Expected behavior: a traveller's like counts once; the post shows it as liked for Ben only
  // Expected output: { likeCount: 1, likedByMe: true } both times
  test('Likes a post once', async () => {
    const { ava, ben, client, share } = await sharing();
    const post = await share(ava);

    const first = await client(ben).put(`/api/posts/${post.id}/like`);
    const again = await client(ben).put(`/api/posts/${post.id}/like`);

    expect(first.status).toBe(200);
    expect(again.body as LikeState).toEqual({ likeCount: 1, likedByMe: true });
    expect(((await client(ben).get(`/api/posts/${post.id}`)).body as PostDto).likedByMe).toBe(true);
    expect(((await client(ava).get(`/api/posts/${post.id}`)).body as PostDto).likedByMe).toBe(false);
  });

  // Input: Cleo likes a post of Ben's private account
  // Expected status code: 404
  // Expected behavior: nothing changes
  // Expected output: { error: "Post not found" }
  test('Cannot like a hidden post', async () => {
    const { ben, cleo, client, share, makePrivate } = await sharing();
    await makePrivate(ben);
    const post = await share(ben);

    const response = await client(cleo).put(`/api/posts/${post.id}/like`);

    expect(response.status).toBe(404);
  });
});

// Interface DELETE /api/posts/:postId/like
describe('Unmocked: DELETE /api/posts/:postId/like', () => {
  // Input: Ben unlikes Ava's post after liking it, then unlikes it again
  // Expected status code: 200 for both
  // Expected behavior: the like is removed; unliking twice changes nothing
  // Expected output: { likeCount: 0, likedByMe: false } both times
  test('Unlikes a post', async () => {
    const { ava, ben, client, share } = await sharing();
    const post = await share(ava);
    await client(ben).put(`/api/posts/${post.id}/like`);

    const first = await client(ben).delete(`/api/posts/${post.id}/like`);
    const again = await client(ben).delete(`/api/posts/${post.id}/like`);

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ likeCount: 0, likedByMe: false });
    expect(again.body).toEqual({ likeCount: 0, likedByMe: false });
  });
});

// Interface GET /api/posts/:postId/comments
describe('Unmocked: GET /api/posts/:postId/comments', () => {
  // Input: Ben, then Ava, comment on Ava's post; Ben reads the comments
  // Expected status code: 200
  // Expected behavior: comments come oldest first, marked as Ben's own where they are
  // Expected output: Ben's comment (mine), then Ava's (not mine); the post's commentCount is 2
  test('Lists comments oldest first', async () => {
    const { ava, ben, client, share } = await sharing();
    const post = await share(ava);
    await client(ben).post(`/api/posts/${post.id}/comments`, { text: 'Which bakery is this?' });
    await client(ava).post(`/api/posts/${post.id}/comments`, { text: 'Morning Bakery!' });

    const response = await client(ben).get(`/api/posts/${post.id}/comments`);

    const { comments } = response.body as { comments: CommentDto[] };
    expect(response.status).toBe(200);
    expect(comments.map((comment) => [comment.author.name, comment.text, comment.mine])).toEqual([
      ['Ben Traveller', 'Which bakery is this?', true],
      ['Ava Traveller', 'Morning Bakery!', false],
    ]);
    expect(feed(await client(ben).get('/api/posts')).at(0)?.commentCount).toBe(2);
  });

  // Input: Cleo reads the comments of a post of Ben's private account
  // Expected status code: 404
  // Expected behavior: nothing is revealed
  // Expected output: { error: "Post not found" }
  test('Comments of a hidden post', async () => {
    const { ben, cleo, client, share, makePrivate } = await sharing();
    await makePrivate(ben);
    const post = await share(ben);

    const response = await client(cleo).get(`/api/posts/${post.id}/comments`);

    expect(response.status).toBe(404);
  });
});

// Interface POST /api/posts/:postId/comments
describe('Unmocked: POST /api/posts/:postId/comments', () => {
  // Input: Ben comments "  Looks fun  " on Ava's post
  // Expected status code: 201
  // Expected behavior: the comment is saved, trimmed
  // Expected output: the comment by Ben, marked as his
  test('Adds a comment', async () => {
    const { ava, ben, client, share } = await sharing();
    const post = await share(ava);

    const response = await client(ben).post(`/api/posts/${post.id}/comments`, { text: '  Looks fun  ' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ author: { id: ben.userId, name: 'Ben Traveller' }, text: 'Looks fun', mine: true });
  });

  // Input: an empty comment and a 301-character comment
  // Expected status code: 400 for both
  // Expected behavior: nothing is saved
  // Expected output: { error: "Invalid request", details: [...] }
  test.each(['   ', 'x'.repeat(301)])('Invalid comment %p', async (text) => {
    const { ava, client, share } = await sharing();
    const post = await share(ava);

    const response = await client(ava).post(`/api/posts/${post.id}/comments`, { text });

    expect(response.status).toBe(400);
    expect(await CommentModel.countDocuments()).toBe(0);
  });
});

// Interface DELETE /api/posts/:postId/comments/:commentId
describe('Unmocked: DELETE /api/posts/:postId/comments/:commentId', () => {
  // Input: Ben's comment on Ava's post, deleted by Ben, and by Ava
  // Expected status code: 204 for both
  // Expected behavior: a comment's author and the post's author may delete it
  // Expected output: no body; the comment is gone
  test.each(['the comment author', 'the post author'])('Deleted by %s', async (who) => {
    const { ava, ben, client, share } = await sharing();
    const post = await share(ava);
    const comment = (await client(ben).post(`/api/posts/${post.id}/comments`, { text: 'Looks fun' })).body as CommentDto;

    const response = await client(who === 'the post author' ? ava : ben).delete(`/api/posts/${post.id}/comments/${comment.id}`);

    expect(response.status).toBe(204);
    expect(await CommentModel.countDocuments()).toBe(0);
  });

  // Input: Cleo deletes Ben's comment on Ava's post; then a comment id no comment has, and a malformed one
  // Expected status code: 403, then 404 and 404
  // Expected behavior: nothing is deleted
  // Expected output: the matching error
  test('Refused deletions', async () => {
    const { ava, ben, cleo, client, share } = await sharing();
    const post = await share(ava);
    const comment = (await client(ben).post(`/api/posts/${post.id}/comments`, { text: 'Looks fun' })).body as CommentDto;

    const notTheirs = await client(cleo).delete(`/api/posts/${post.id}/comments/${comment.id}`);
    const unknown = await client(ava).delete(`/api/posts/${post.id}/comments/64b7f0c2a1b2c3d4e5f60718`);
    const malformed = await client(ava).delete(`/api/posts/${post.id}/comments/not-an-id`);

    expect(notTheirs.status).toBe(403);
    expect(notTheirs.body).toEqual({ error: "Only the comment's author or the post's author can delete it" });
    expect(unknown.status).toBe(404);
    expect(malformed.body).toEqual({ error: 'Comment not found' });
    expect(await CommentModel.countDocuments()).toBe(1);
  });
});

// Interface POST /api/posts/:postId/copy
describe('Unmocked: POST /api/posts/:postId/copy', () => {
  // Input: Ben copies Ava's Saturday trip to start on Monday 2026-11-02
  // Expected status code: 201
  // Expected behavior: a new personal trip of Ben's, with the same stops in the same order, re-timed for Monday
  // Expected output: the itinerary on 2026-11-02 (weekday 1), stops in Ava's order, and a note saying where it came from
  test('Copies a shared trip onto new dates', async () => {
    const { ava, ben, client, share } = await sharing();
    const post = await share(ava);

    const response = await client(ben).post(`/api/posts/${post.id}/copy`, { startDate: '2026-11-02' });

    const itinerary = response.body as ItineraryDto;
    expect(response.status).toBe(201);
    expect(itinerary).toMatchObject({ city: 'Testville', startDate: '2026-11-02', endDate: '2026-11-02', groupId: null, pace: 'moderate' });
    expect(itinerary.days.map((day) => day.weekday)).toEqual([1]);
    expect(itinerary.days.at(0)?.stops.map((stop) => stop.name)).toEqual(AVA_TRIP);
    expect(itinerary.days.at(0)?.stops.at(0)?.startTime).not.toBe('09:00');
    expect(itinerary.warnings).toEqual(["Copied from Ava Traveller's Testville trip."]);
    const bensTrips = (await client(ben).get('/api/itineraries')).body as { itineraries: { id: string }[] };
    expect(bensTrips.itineraries.map((trip) => trip.id)).toEqual([itinerary.id]);
  });

  // Input: Ava's trip [Harbour Park, Lookout Tower, Night Market]; Lookout Tower has since left the catalogue, and
  //        Night Market (opens 17:00 for an hour) cannot fit a day ending at 18:00; Ben copies it to Monday
  // Expected status code: 201
  // Expected behavior: stops that no longer fit are left out, each with a warning
  // Expected output: only Harbour Park, and a warning for each left-out stop
  test('Leaves out stops that no longer fit', async () => {
    const { ava, ben, client, share } = await sharing();
    const post = await share(ava, ['Harbour Park', 'Lookout Tower', 'Night Market']);
    await ActivityModel.deleteOne({ name: 'Lookout Tower' });

    const response = await client(ben).post(`/api/posts/${post.id}/copy`, { startDate: '2026-11-02' });

    const itinerary = response.body as ItineraryDto;
    expect(itinerary.days.at(0)?.stops.map((stop) => stop.name)).toEqual(['Harbour Park']);
    expect(itinerary.unscheduledCount).toBe(2);
    expect(itinerary.warnings.slice(1)).toEqual([
      'Lookout Tower does not fit Monday on your dates, so it was left out.',
      'Night Market does not fit Monday on your dates, so it was left out.',
    ]);
  });

  // Input: startDate "next Monday", and a copy of a private stranger's post
  // Expected status code: 400 and 404
  // Expected behavior: no trip is created
  // Expected output: the matching error
  test('Copy refused', async () => {
    const { ava, ben, cleo, client, share, makePrivate } = await sharing();
    const post = await share(ava);
    await makePrivate(ben);
    const hidden = await share(ben);

    const badDate = await client(cleo).post(`/api/posts/${post.id}/copy`, { startDate: 'next Monday' });
    const hiddenCopy = await client(cleo).post(`/api/posts/${hidden.id}/copy`, { startDate: '2026-11-02' });

    expect(badDate.status).toBe(400);
    expect(hiddenCopy.status).toBe(404);
    expect(((await client(cleo).get('/api/itineraries')).body as { itineraries: unknown[] }).itineraries).toEqual([]);
  });
});
