import request from 'supertest';

import type { TaggedPlace } from '../../src/activities/activityService';
import { INTEREST_TAGS } from '../../src/activities/interests';
import { DEMO_VANCOUVER_PLACES } from '../../src/dev/demoVancouverPlaces';
import { MAX_CANDIDATES } from '../../src/itineraries/engine/candidates';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

/*
 * NFR 1, itinerary generation time: generating a 5-day itinerary from at least 40 candidate
 * activities completes within 3 s at the 95th percentile, measured at the API (request in, plan out,
 * including the database reads and write).
 */
const P95_LIMIT_MS = 3000;
const RUNS = 20;

/** 30 demo places plus 30 synthetic downtown ones, so pruning still leaves the maximum 40 candidates. */
function largeCatalogue(): TaggedPlace[] {
  const synthetic = Array.from({ length: 30 }, (_, index): TaggedPlace => ({
    placeId: `nfr-place-${String(index)}`,
    name: `Synthetic activity ${String(index)}`,
    address: 'Vancouver, BC',
    location: { lat: 49.27 + (index % 6) * 0.006, lng: -123.14 + Math.floor(index / 6) * 0.01 },
    types: [],
    rating: 3.8 + (index % 10) / 10,
    userRatingCount: 50 + index,
    openingPeriods: undefined,
    foundBy: [INTEREST_TAGS[index % INTEREST_TAGS.length] ?? 'landmarks'],
  }));
  return [...DEMO_VANCOUVER_PLACES, ...synthetic];
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  const index = Math.min(sortedValues.length - 1, Math.ceil(fraction * sortedValues.length) - 1);
  return sortedValues.at(index) ?? Number.NaN;
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterAll(stopTestDatabase);

describe('NFR: itinerary generation time', () => {
  test(`p95 of ${String(RUNS)} five-day generations is under ${String(P95_LIMIT_MS)} ms`, async () => {
    const { app, authService, activityService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await activityService.importPlaces('Vancouver', largeCatalogue());
    const trip = {
      city: 'Vancouver',
      startDate: '2026-10-21',
      endDate: '2026-10-25',
      dayStart: '08:00',
      dayEnd: '21:00',
      interests: [],
      pace: 'packed',
    };

    const durations: number[] = [];
    let lastItinerary: ItineraryDto | undefined;
    for (let run = 0; run < RUNS; run += 1) {
      const startedAt = performance.now();
      const response = await request(app).post('/api/itineraries/generate').set(authorization).send(trip);
      durations.push(performance.now() - startedAt);
      expect(response.status).toBe(201);
      lastItinerary = response.body as ItineraryDto;
    }

    const sorted = [...durations].sort((left, right) => left - right);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const stops = lastItinerary?.days.reduce((count, day) => count + day.stops.length, 0) ?? 0;
    console.info(
      [
        `NFR itinerary generation: ${String(RUNS)} runs, 5 days, ${String(lastItinerary?.candidateCount)} candidates, ${String(stops)} stops`,
        `p50 ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, max ${(sorted.at(-1) ?? 0).toFixed(0)} ms (limit ${String(P95_LIMIT_MS)} ms)`,
      ].join('\n'),
    );
    expect(lastItinerary?.candidateCount).toBe(MAX_CANDIDATES);
    expect(lastItinerary?.days).toHaveLength(5);
    expect(p95).toBeLessThan(P95_LIMIT_MS);
  }, 120_000);
});
