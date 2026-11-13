import request from 'supertest';

import { ActivityModel } from '../../src/activities/activityModel';
import type { GroupDto } from '../../src/groups/groupService';
import { TripModel } from '../../src/trips/tripModel';
import type { TripDto } from '../../src/trips/tripService';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';
import { seedTestville, storeTestvilleTrip } from '../helpers/testville';

type Stop = TripDto['days'][number]['stops'][number];

function stopsOf(trip: TripDto, dayIndex = 0): Stop[] {
  return trip.days.at(dayIndex)?.stops ?? [];
}

function names(trip: TripDto, dayIndex = 0): string[] {
  return stopsOf(trip, dayIndex).map((stop) => stop.name);
}

function idOf(trip: TripDto, name: string): string {
  return stopsOf(trip).find((stop) => stop.name === name)?.activityId ?? '';
}

async function testvilleTrip(stopNames: string[], options: Parameters<typeof storeTestvilleTrip>[2] = {}) {
  const testApp = createTestApp();
  const owner = await signedInUser(testApp.authService, 'Trip Owner');
  await seedTestville(testApp.activityService);
  const tripId = await storeTestvilleTrip(owner.userId, stopNames, options);
  const trip = (await request(testApp.app).get(`/api/trips/${tripId}`).set(owner.authorization)).body as TripDto;
  const adjust = (body: object, authorization = owner.authorization) =>
    request(testApp.app).post(`/api/trips/${tripId}/adjust`).set(authorization).send(body);
  return { ...testApp, owner, trip, adjust };
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface POST /api/trips/:tripId/adjust
describe('Unmocked: POST /api/trips/:tripId/adjust', () => {
  // Input: lock Harbour Park, then unlock it, each with the version last seen
  // Expected status code: 200 for both
  // Expected behavior: only the stop's lock changes; the version goes up by one each time
  // Expected output: the trip with Harbour Park locked (version 1), then unlocked (version 2)
  test('Locks and unlocks a stop', async () => {
    const { trip, adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park']);
    const park = idOf(trip, 'Harbour Park');

    const locked = await adjust({ action: 'lock', version: 0, dayIndex: 0, activityId: park });
    const unlocked = await adjust({ action: 'unlock', version: 1, dayIndex: 0, activityId: park });

    expect(locked.status).toBe(200);
    expect((locked.body as TripDto).version).toBe(1);
    expect(stopsOf(locked.body as TripDto).map((stop) => stop.locked)).toEqual([false, true]);
    expect(stopsOf(locked.body as TripDto).map((stop) => stop.startTime)).toEqual(stopsOf(trip).map((stop) => stop.startTime));
    expect(unlocked.status).toBe(200);
    expect((unlocked.body as TripDto).version).toBe(2);
    expect(stopsOf(unlocked.body as TripDto).every((stop) => !stop.locked)).toBe(true);
  });

  // Input: remove Harbour Park from [Morning Bakery, Harbour Park, Town Museum]
  // Expected status code: 200
  // Expected behavior: the other stops keep their order and are re-timed; the freed time goes to another activity
  // Expected output: Morning Bakery before Town Museum, Lookout Tower added, Harbour Park gone
  test('Removes a stop and fills the freed time', async () => {
    const { trip, adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park', 'Town Museum']);

    const response = await adjust({ action: 'remove', version: 0, dayIndex: 0, activityId: idOf(trip, 'Harbour Park') });

    const day = names(response.body as TripDto);
    expect(response.status).toBe(200);
    expect(day).not.toContain('Harbour Park');
    expect(day).toContain('Lookout Tower');
    expect(day.indexOf('Morning Bakery')).toBeLessThan(day.indexOf('Town Museum'));
    expect(day.at(0)).toBe('Morning Bakery');
  });

  // Input: remove Harbour Park from [Morning Bakery, Harbour Park, Town Museum] in a trip that avoids Lookout Tower
  // Expected status code: 200
  // Expected behavior: the freed time is never given to a place the trip avoids
  // Expected output: neither Harbour Park nor Lookout Tower in the day
  test('Removing a stop never brings in an avoided place', async () => {
    const { trip, adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park', 'Town Museum']);
    const tower = await ActivityModel.findOne({ name: 'Lookout Tower' });
    await TripModel.updateOne({ _id: trip.id }, { $set: { avoidIds: [tower?._id] } });

    const response = await adjust({ action: 'remove', version: 0, dayIndex: 0, activityId: idOf(trip, 'Harbour Park') });

    expect(response.status).toBe(200);
    expect(names(response.body as TripDto)).not.toContain('Harbour Park');
    expect(names(response.body as TripDto)).not.toContain('Lookout Tower');
  });

  // Input: move Lookout Tower from last to first in [Harbour Park, Town Museum, Lookout Tower]
  // Expected status code: 200
  // Expected behavior: the stops are re-timed in the new order
  // Expected output: [Lookout Tower, Harbour Park, Town Museum], each starting after the one before ends
  test('Moves a stop', async () => {
    const { trip, adjust } = await testvilleTrip(['Harbour Park', 'Town Museum', 'Lookout Tower']);

    const response = await adjust({ action: 'move', version: 0, dayIndex: 0, activityId: idOf(trip, 'Lookout Tower'), toIndex: 0 });

    const stops = stopsOf(response.body as TripDto);
    expect(response.status).toBe(200);
    expect(stops.map((stop) => stop.name)).toEqual(['Lookout Tower', 'Harbour Park', 'Town Museum']);
    expect(stops.every((stop, index) => index === 0 || stop.startTime >= (stops.at(index - 1)?.endTime ?? ''))).toBe(true);
  });

  // Input: move Morning Bakery (closes 12:00) after a park visit and a 2-hour museum visit
  // Expected status code: 422
  // Expected behavior: the move is refused and the trip is unchanged
  // Expected output: an error naming the stop; a later read shows version 0
  test('Move would miss opening hours', async () => {
    const { app, owner, trip, adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park', 'Town Museum']);

    const response = await adjust({ action: 'move', version: 0, dayIndex: 0, activityId: idOf(trip, 'Morning Bakery'), toIndex: 2 });

    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/^Morning Bakery cannot go there/);
    const after = await request(app).get(`/api/trips/${trip.id}`).set(owner.authorization);
    expect((after.body as TripDto).version).toBe(0);
  });

  // Input: re-plan from 11:00 a day whose first two stops already started (09:00, 10:00) and whose Lookout Tower is locked
  // Expected status code: 200
  // Expected behavior: started stops stay as they are; the locked stop stays; the rest of the day is re-chosen after them
  // Expected output: the same first two stops, Lookout Tower still locked, no other stop starting before 11:00
  test('Re-plans the rest of a day', async () => {
    const { trip, adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park', 'Lookout Tower'], {
      locked: ['Lookout Tower'],
      startTimes: { 'Morning Bakery': '09:00', 'Harbour Park': '10:00', 'Lookout Tower': '12:00' },
    });

    const response = await adjust({ action: 'replan', version: 0, dayIndex: 0, fromTime: '11:00' });

    const stops = stopsOf(response.body as TripDto);
    expect(response.status).toBe(200);
    expect(stops.slice(0, 2)).toEqual(stopsOf(trip).slice(0, 2));
    expect(stops.find((stop) => stop.name === 'Lookout Tower')?.locked).toBe(true);
    expect(stops.slice(2).every((stop) => stop.startTime >= '11:00')).toBe(true);
    expect(stops.map((stop) => stop.name)).toContain('Town Museum');
  });

  // Input: re-plan a whole generated Vancouver day (no fromTime) after locking its second stop
  // Expected status code: 200
  // Expected behavior: the day is re-solved around the locked stop, inside the day's hours, without repeating other days' stops
  // Expected output: the locked stop still there, locked and at the same time; every stop between 09:00 and 18:00;
  //                  no activity twice in the trip
  test('Re-plans a whole day around a locked stop', async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await seedVancouver(activityService);
    const generated = (
      await request(app)
        .post('/api/trips/generate')
        .set(authorization)
        .send({ city: 'Vancouver', startDate: '2026-10-24', endDate: '2026-10-25', interests: ['outdoors'] })
    ).body as TripDto;
    const lockedStop = stopsOf(generated).at(1);
    const lockedId = lockedStop?.activityId ?? '';
    await request(app)
      .post(`/api/trips/${generated.id}/adjust`)
      .set(authorization)
      .send({ action: 'lock', version: 0, dayIndex: 0, activityId: lockedId });

    const response = await request(app).post(`/api/trips/${generated.id}/adjust`).set(authorization).send({ action: 'replan', version: 1, dayIndex: 0 });

    const replanned = response.body as TripDto;
    const all = replanned.days.flatMap((day) => day.stops);
    expect(response.status).toBe(200);
    expect(stopsOf(replanned).find((stop) => stop.activityId === lockedId)).toMatchObject({
      locked: true,
      startTime: lockedStop?.startTime,
      endTime: lockedStop?.endTime,
    });
    expect(stopsOf(replanned).every((stop) => stop.startTime >= '09:00' && stop.endTime <= '18:00')).toBe(true);
    expect(new Set(all.map((stop) => stop.activityId)).size).toBe(all.length);
  });

  // Input: a locked Town Museum (2-hour visit, closes 17:00) not yet started, re-planned from 16:00
  // Expected status code: 422
  // Expected behavior: the locked stop cannot fit, so nothing changes
  // Expected output: { error: "Your locked stops no longer fit the rest of the day; unlock one and try again" }
  test('Locked stops no longer fit', async () => {
    const { adjust } = await testvilleTrip(['Harbour Park', 'Town Museum'], {
      locked: ['Town Museum'],
      startTimes: { 'Harbour Park': '09:00', 'Town Museum': '16:30' },
    });

    const response = await adjust({ action: 'replan', version: 0, dayIndex: 0, fromTime: '16:00' });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: 'Your locked stops no longer fit the rest of the day; unlock one and try again' });
  });

  // Input: two adjustments sent with the same version (two people editing at once), then one with an old version
  // Expected status code: 200 for the first, 409 for the others
  // Expected behavior: the second change does not overwrite the first
  // Expected output: { error: "This trip changed since you loaded it; reload it and try again" }
  test('Edits from an out-of-date copy are refused', async () => {
    const { trip, adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park']);
    const park = idOf(trip, 'Harbour Park');

    const first = await adjust({ action: 'lock', version: 0, dayIndex: 0, activityId: park });
    const second = await adjust({ action: 'remove', version: 0, dayIndex: 0, activityId: park });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'This trip changed since you loaded it; reload it and try again' });
  });

  // Input: a group member locks a stop of the group's trip; a traveller outside the group tries too
  // Expected status code: 200 for the member, 404 for the outsider
  // Expected behavior: any member can adjust a group trip; others cannot see it
  // Expected output: the adjusted trip, then { error: "Trip not found" }
  test('Group members can adjust a group trip', async () => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService, 'Trip Owner');
    const member = await signedInUser(authService, 'Group Member');
    const outsider = await signedInUser(authService, 'Outsider');
    await seedTestville(activityService);
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    const tripId = await storeTestvilleTrip(owner.userId, ['Harbour Park'], { groupId: group.id });
    const trip = (await request(app).get(`/api/trips/${tripId}`).set(owner.authorization)).body as TripDto;
    const body = { action: 'lock', version: 0, dayIndex: 0, activityId: idOf(trip, 'Harbour Park') };

    const byMember = await request(app).post(`/api/trips/${tripId}/adjust`).set(member.authorization).send(body);
    const byOutsider = await request(app).post(`/api/trips/${tripId}/adjust`).set(outsider.authorization).send({ ...body, version: 1 });

    expect(byMember.status).toBe(200);
    expect(byOutsider.status).toBe(404);
  });

  // Input: in a group trip [Morning Bakery, Harbour Park, Town Museum], a member vetoes Harbour Park, then Town Museum is removed
  // Expected status code: 200
  // Expected behavior: a vetoed stop already in the plan stays until someone removes it, but is never added again
  // Expected output: Morning Bakery still before Harbour Park (new stops may fill gaps between them), Town Museum gone
  test('A stop vetoed after planning stays until removed', async () => {
    const { app, authService, activityService } = createTestApp();
    const owner = await signedInUser(authService, 'Trip Owner');
    await seedTestville(activityService);
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    const tripId = await storeTestvilleTrip(owner.userId, ['Morning Bakery', 'Harbour Park', 'Town Museum'], { groupId: group.id });
    const trip = (await request(app).get(`/api/trips/${tripId}`).set(owner.authorization)).body as TripDto;
    await request(app)
      .put(`/api/groups/${group.id}/members/me`)
      .set(owner.authorization)
      .send({ vetoedActivityIds: [idOf(trip, 'Harbour Park')] });

    const response = await request(app)
      .post(`/api/trips/${tripId}/adjust`)
      .set(owner.authorization)
      .send({ action: 'remove', version: 0, dayIndex: 0, activityId: idOf(trip, 'Town Museum') });

    const day = names(response.body as TripDto);
    expect(response.status).toBe(200);
    expect(day).toContain('Harbour Park');
    expect(day.indexOf('Morning Bakery')).toBeLessThan(day.indexOf('Harbour Park'));
    expect(day).not.toContain('Town Museum');
  });

  // Input: add Lookout Tower to [Morning Bakery, Harbour Park]
  // Expected status code: 200
  // Expected behavior: the place goes where it adds the least travel; the stops already there stay in order
  // Expected output: the day with Lookout Tower, Morning Bakery still before Harbour Park, version 1
  test('Adds a chosen place to a day', async () => {
    const { adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park']);
    const lookout = (await ActivityModel.findOne({ name: 'Lookout Tower' }))?._id.toString();

    const response = await adjust({ action: 'add', version: 0, dayIndex: 0, activityId: lookout });

    const day = names(response.body as TripDto);
    expect(response.status).toBe(200);
    expect(day).toContain('Lookout Tower');
    expect(day.indexOf('Morning Bakery')).toBeLessThan(day.indexOf('Harbour Park'));
    expect((response.body as TripDto).version).toBe(1);
  });

  // Input: add Lookout Tower to a day that is full, with Morning Bakery (and Town Museum) locked: a relaxed day that
  //        already has its 3 stops, and a day ending at 13:00 with no time left after Harbour Park
  // Expected status code: 200
  // Expected behavior: the unlocked stop is dropped to make room; locked stops keep their times
  // Expected output: the day with Lookout Tower and without Harbour Park; the members are told what was dropped
  test.each([
    [
      'as many stops as the pace allows',
      ['Morning Bakery', 'Harbour Park', 'Town Museum'],
      { pace: 'relaxed' as const, locked: ['Morning Bakery', 'Town Museum'], startTimes: { 'Morning Bakery': '10:00', 'Town Museum': '13:00' } },
    ],
    ['no time left', ['Morning Bakery', 'Harbour Park'], { dayEnd: '13:00', locked: ['Morning Bakery'], startTimes: { 'Morning Bakery': '09:30' } }],
  ])('Adds a chosen place to a full day by dropping an unlocked stop: %s', async (_scenario, stopNames, options) => {
    const { trip, tripService, adjust } = await testvilleTrip(stopNames, options);
    const summaries: string[] = [];
    tripService.onTripChanged((change) => summaries.push(change.summary));
    const lookout = (await ActivityModel.findOne({ name: 'Lookout Tower' }))?._id.toString();

    const response = await adjust({ action: 'add', version: 0, dayIndex: 0, activityId: lookout });

    const stops = stopsOf(response.body as TripDto);
    expect(response.status).toBe(200);
    expect(stops.map((stop) => stop.name)).toContain('Lookout Tower');
    expect(stops.map((stop) => stop.name)).not.toContain('Harbour Park');
    for (const locked of stopsOf(trip).filter((stop) => stop.locked)) {
      expect(stops.find((stop) => stop.name === locked.name)?.startTime).toBe(locked.startTime);
    }
    expect(summaries).toEqual(['Trip added Lookout Tower, dropping Harbour Park to make room']);
  });

  // Input: add a place already in the trip, a place from another city, Night Market (opens 17:00 for an hour's visit)
  //        to a day that ends at 18:00, and Lookout Tower to a day ending at 14:00 whose only stops are locked and fill it
  // Expected status code: 409, 404, 422 and 422
  // Expected behavior: nothing changes
  // Expected output: the matching error message
  test.each([
    ['already in the trip', 'Harbour Park', ['Harbour Park'], {}, 409, 'That place is already in this trip'],
    ['from another city', 'Stanley Park Seawall', ['Harbour Park'], {}, 404, "That place is not in this city's activities"],
    [
      'never open in time',
      'Night Market',
      ['Harbour Park'],
      {},
      422,
      'Night Market does not fit that day: it would miss its opening hours, clash with a locked stop or run late',
    ],
    [
      'only locked stops',
      'Lookout Tower',
      ['Morning Bakery', 'Town Museum'],
      {
        pace: 'relaxed' as const,
        dayEnd: '14:00',
        locked: ['Morning Bakery', 'Town Museum'],
        startTimes: { 'Morning Bakery': '10:00', 'Town Museum': '11:45' },
      },
      422,
      'Lookout Tower does not fit that day: it would miss its opening hours, clash with a locked stop or run late',
    ],
  ])('Add refused: %s', async (_scenario, placeName, stopNames, options, status, error) => {
    const { activityService, adjust } = await testvilleTrip(stopNames, options);
    await seedVancouver(activityService);
    const placeId = (await ActivityModel.findOne({ name: placeName }))?._id.toString();

    const response = await adjust({ action: 'add', version: 0, dayIndex: 0, activityId: placeId });

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error });
  });

  // Input: mark Harbour Park visited, then not visited
  // Expected status code: 200 for both
  // Expected behavior: only the stop's visited mark changes; times stay as they were
  // Expected output: Harbour Park visited (version 1), then not visited (version 2)
  test('Marks a stop visited and not visited', async () => {
    const { trip, adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park']);
    const park = idOf(trip, 'Harbour Park');

    const visited = await adjust({ action: 'visit', version: 0, dayIndex: 0, activityId: park });
    const unvisited = await adjust({ action: 'unvisit', version: 1, dayIndex: 0, activityId: park });

    expect(visited.status).toBe(200);
    expect(stopsOf(visited.body as TripDto).map((stop) => stop.visited)).toEqual([false, true]);
    expect(stopsOf(visited.body as TripDto).map((stop) => stop.startTime)).toEqual(stopsOf(trip).map((stop) => stop.startTime));
    expect(unvisited.status).toBe(200);
    expect(stopsOf(unvisited.body as TripDto).every((stop) => !stop.visited)).toBe(true);
  });

  // Input: mark Morning Bakery visited, then remove Harbour Park
  // Expected status code: 200 for both
  // Expected behavior: a stop stays visited when the rest of the day is repaired
  // Expected output: Morning Bakery still visited after the removal
  test('A visited stop stays visited when the day changes', async () => {
    const { trip, adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park']);

    await adjust({ action: 'visit', version: 0, dayIndex: 0, activityId: idOf(trip, 'Morning Bakery') });
    const response = await adjust({ action: 'remove', version: 1, dayIndex: 0, activityId: idOf(trip, 'Harbour Park') });

    expect(stopsOf(response.body as TripDto).find((stop) => stop.name === 'Morning Bakery')?.visited).toBe(true);
  });

  // Input: a stop that is not in the day, a day index past the trip, and a target position past the day
  // Expected status code: 404, 400 and 400
  // Expected behavior: nothing changes
  // Expected output: the matching error message
  test.each([
    ['stop not in the day', { action: 'lock', activityId: '64b7f0c2a1b2c3d4e5f60718' }, 404, 'That stop is not in this day'],
    ['day out of range', { action: 'replan', dayIndex: 3 }, 400, 'dayIndex is out of range'],
    ['position out of range', { action: 'move', toIndex: 5 }, 400, 'toIndex is out of range'],
  ])('Adjustment refused: %s', async (_scenario, change, status, error) => {
    const { trip, adjust } = await testvilleTrip(['Morning Bakery', 'Harbour Park']);

    const response = await adjust({ version: 0, dayIndex: 0, activityId: idOf(trip, 'Harbour Park'), ...change });

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error });
  });

  // Input: an unknown action, a missing version, an activity id that is not an id, and a badly written fromTime
  // Expected status code: 400 for each
  // Expected behavior: nothing changes
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([
    { action: 'shuffle', version: 0, dayIndex: 0 },
    { action: 'lock', dayIndex: 0, activityId: '64b7f0c2a1b2c3d4e5f60718' },
    { action: 'remove', version: 0, dayIndex: 0, activityId: 'stanley-park' },
    { action: 'replan', version: 0, dayIndex: 0, fromTime: '3pm' },
  ])('Invalid adjustment %#', async (body) => {
    const { adjust } = await testvilleTrip(['Harbour Park']);

    const response = await adjust(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request');
  });
});
