import request from 'supertest';

import { INTEREST_TAGS } from '../../src/activities/interests';
import type { PlaceResult, PlacesClient } from '../../src/activities/placesClient';
import { DEMO_VANCOUVER_PLACES } from '../../src/dev/demoVancouverPlaces';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

/*
 * NFR 3, bounded Google Places usage: each city's activity catalogue is fetched from Google Places at most once every
 * 7 days (one text search per interest tag); searching or generating itineraries for a city fetched in the last 7 days
 * makes no Places calls (an entered lodging is looked up once).
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
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
        .post('/api/itineraries/generate')
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
  });
});
