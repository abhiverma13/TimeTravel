import request from 'supertest';

import { INTEREST_TAGS } from '../../src/activities/interests';
import type { PlaceResult, PlacesClient } from '../../src/activities/placesClient';
import { DEMO_VANCOUVER_PLACES } from '../../src/dev/demoVancouverPlaces';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

/*
 * NFR 3, bounded Google Places usage: each city's activity catalogue is fetched from Google Places at most once every
 * 7 days (one text search per interest tag); searching or generating trips for a city fetched in the last 7 days
 * makes no Places calls (an entered lodging is looked up once).
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60_000;
// These tests send dozens of requests through the real app; a busy machine needs longer than Jest's 5 s default.
const NFR_TIMEOUT_MS = 60_000;
const SEARCHES_PER_FETCH = INTEREST_TAGS.length;

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterAll(stopTestDatabase);

describe('NFR: bounded Google Places usage', () => {
  test('A city is fetched once a week, whatever travellers do in between', async () => {
    let now = new Date('2026-10-20T12:00:00Z');
    const places: PlacesClient & { searchText: jest.Mock } = {
      searchText: jest.fn(async (): Promise<PlaceResult[]> => Promise.resolve([...DEMO_VANCOUVER_PLACES])),
    };
    const { app, authService } = createTestApp({ placesClient: places, now: () => now });
    const travellers = [await signedInUser(authService, 'First Traveller'), await signedInUser(authService, 'Second Traveller')];
    const search = async (index: number) =>
      request(app)
        .get(`/api/activities?city=Vancouver${index % 2 === 0 ? '' : `&interest=${INTEREST_TAGS[index % SEARCHES_PER_FETCH] ?? 'food'}`}`)
        .set(travellers[index % 2]?.authorization ?? {});
    const generate = async (index: number, lodging?: string) =>
      request(app)
        .post('/api/trips/generate')
        .set(travellers[index % 2]?.authorization ?? {})
        .send({ city: 'Vancouver', startDate: '2026-10-28', endDate: '2026-10-29', ...(lodging === undefined ? {} : { lodging }) });

    // The first search fetches the city: one text search per interest tag.
    await search(0);
    const afterFirstFetch = places.searchText.mock.calls.length;
    // Six days of searching and planning by two travellers, over the cached catalogue.
    for (let day = 0; day < 6; day += 1) {
      now = new Date(now.getTime() + MS_PER_DAY);
      for (let index = 0; index < 4; index += 1) {
        expect((await search(index)).status).toBe(200);
      }
      expect((await generate(day)).status).toBe(201);
    }
    const afterSixDays = places.searchText.mock.calls.length;
    // A day later the week is up, and the next search fetches the city again.
    now = new Date(now.getTime() + MS_PER_DAY + 60_000);
    await search(1);
    const afterAWeek = places.searchText.mock.calls.length;
    // An entered lodging is looked up once, and nothing else.
    await generate(1, 'Fairmont Pacific Rim');
    const afterLodging = places.searchText.mock.calls.length;

    console.info(
      `NFR Places usage: ${String(afterFirstFetch)} calls for the first fetch; ${String(afterSixDays - afterFirstFetch)} more over ` +
        `6 days of 24 searches and 6 generations; ${String(afterAWeek - afterSixDays)} for the refresh after 7 days; ` +
        `${String(afterLodging - afterAWeek)} for a lodging lookup`,
    );
    expect(afterFirstFetch).toBe(SEARCHES_PER_FETCH);
    expect(afterSixDays).toBe(SEARCHES_PER_FETCH);
    expect(afterAWeek).toBe(2 * SEARCHES_PER_FETCH);
    expect(afterLodging - afterAWeek).toBe(1);
  }, NFR_TIMEOUT_MS);

  test('While Google Places fails, a stale city is retried at most once an hour', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let now = new Date('2026-11-20T12:00:00Z');
    let googleDown = false;
    const places: PlacesClient & { searchText: jest.Mock } = {
      searchText: jest.fn(async (): Promise<PlaceResult[]> =>
        googleDown ? Promise.reject(new Error('Places is down')) : Promise.resolve([...DEMO_VANCOUVER_PLACES]),
      ),
    };
    const { app, authService } = createTestApp({ placesClient: places, now: () => now });
    const { authorization } = await signedInUser(authService, 'Outage Traveller');
    const search = async () => request(app).get('/api/activities?city=Victoria').set(authorization);

    // The city is fetched, then the week runs out while Google is down.
    await search();
    now = new Date(now.getTime() + 8 * MS_PER_DAY);
    googleDown = true;
    const firstTry = await search();
    const afterFirstTry = places.searchText.mock.calls.length;
    // Twenty searches over the next 50 minutes are served from the stale catalogue without asking Google.
    const statuses: number[] = [];
    for (let minute = 0; minute < 50; minute += 2.5) {
      now = new Date(now.getTime() + 2.5 * MS_PER_MINUTE);
      statuses.push((await search()).status);
    }
    const duringOutage = places.searchText.mock.calls.length - afterFirstTry;
    // An hour after the failed try, Google is asked again; it is back, so the city is fresh for another week.
    now = new Date(now.getTime() + 11 * MS_PER_MINUTE);
    googleDown = false;
    await search();
    const afterRecovery = places.searchText.mock.calls.length;
    await search();

    console.info(
      `NFR Places usage during an outage: ${String(afterFirstTry - SEARCHES_PER_FETCH)} calls for the failed refresh; ` +
        `${String(duringOutage)} over the next 20 searches in 50 minutes; ` +
        `${String(afterRecovery - afterFirstTry - duringOutage)} for the retry an hour later`,
    );
    expect(firstTry.status).toBe(200);
    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(afterFirstTry).toBe(2 * SEARCHES_PER_FETCH);
    expect(duringOutage).toBe(0);
    expect(afterRecovery).toBe(3 * SEARCHES_PER_FETCH);
    expect(places.searchText.mock.calls.length).toBe(3 * SEARCHES_PER_FETCH);
  }, NFR_TIMEOUT_MS);
});
