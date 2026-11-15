import { MUST_SEE_BONUS, pruneCandidates } from '../../src/trips/engine/candidates';
import { estimateTravelMinutes } from '../../src/trips/engine/travelTime';
import type { Candidate, PlanRequest } from '../../src/trips/engine/types';
import { matrixElementLimit } from '../../src/trips/routesClient';

// About 1 km and about 5 km apart along a meridian.
const start = { lat: 49.28, lng: -123.12 };
const near = { lat: 49.287, lng: -123.12 };
const far = { lat: 49.325, lng: -123.12 };

describe('estimateTravelMinutes by transport mode', () => {
  // Input: a trip of about 5 km and one of about 1 km by walking, and the 1 km trip by transit
  // Expected behavior: walk mode walks even the long trip; transit also walks the short hop
  // Expected output: more than 70 minutes to walk 5 km, and the same time for the 1 km trip walked or by transit
  test('walking walks every distance', () => {
    expect(estimateTravelMinutes(start, far, 'walk')).toBeGreaterThan(70);
    expect(estimateTravelMinutes(start, near, 'walk')).toBe(estimateTravelMinutes(start, near, 'transit'));
  });

  // Input: the 5 km trip by transit, by walking, and with no mode given
  // Expected behavior: transit rides the long trip, and transit is the default mode
  // Expected output: transit is faster than walking, and no mode gives the same time as transit
  test('transit walks short hops and rides longer ones', () => {
    expect(estimateTravelMinutes(start, far, 'transit')).toBeLessThan(estimateTravelMinutes(start, far, 'walk'));
    expect(estimateTravelMinutes(start, far)).toBe(estimateTravelMinutes(start, far, 'transit'));
  });

  // Input: the 5 km trip by car and by transit, the 1 km trip by car, and a trip from a point to itself by car
  // Expected behavior: driving beats transit over distance and adds 5 minutes of parking to any trip that moves
  // Expected output: driving 5 km is faster than transit, the 1 km drive takes at least 5 minutes, staying put takes 0
  test('driving is fastest over distance but always pays for parking', () => {
    expect(estimateTravelMinutes(start, far, 'drive')).toBeLessThan(estimateTravelMinutes(start, far, 'transit'));
    expect(estimateTravelMinutes(start, near, 'drive')).toBeGreaterThanOrEqual(5);
    expect(estimateTravelMinutes(start, start, 'drive')).toBe(0);
  });
});

describe('Google Routes matrix limits', () => {
  // Input: the transit, walk and drive modes
  // Expected behavior: matrixElementLimit returns the Google Routes matrix element limit for each mode
  // Expected output: 100 for transit, 625 for walk and drive
  test('transit requests allow 100 pairs, others 625', () => {
    expect(matrixElementLimit('transit')).toBe(100);
    expect(matrixElementLimit('walk')).toBe(625);
    expect(matrixElementLimit('drive')).toBe(625);
  });
});

describe('must-see candidates', () => {
  const request: PlanRequest = {
    days: [{ date: '2026-10-24', weekday: 6 }],
    dayStartMinute: 540,
    dayEndMinute: 1080,
    origin: start,
    interests: [],
    pace: 'moderate',
  };
  const candidate = (id: string, location = near, score = 4): Candidate => ({
    id,
    location,
    interests: [],
    durationMinutes: 60,
    score,
    openingHours: null,
  });

  // Input: a popular place nearby (score 5) and an out-of-town place about 36 km away (score 3), pruned with and
  //        without out-of-town as a must-see
  // Expected behavior: a must-see skips the 25 km limit and gets MUST_SEE_BONUS added to its utility
  // Expected output: with it, out-of-town (utility 3 + MUST_SEE_BONUS) then popular; without it, popular only
  test('a must-see outranks every other candidate and is kept even beyond the usual distance', () => {
    const outOfTown = candidate('out-of-town', { lat: 49.6, lng: -123.12 }, 3);

    const ranked = pruneCandidates([candidate('popular', near, 5), outOfTown], { ...request, mustSeeIds: new Set(['out-of-town']) });
    const without = pruneCandidates([candidate('popular', near, 5), outOfTown], request);

    expect(ranked.map((entry) => entry.id)).toEqual(['out-of-town', 'popular']);
    expect(ranked.at(0)?.utility).toBe(3 + MUST_SEE_BONUS);
    expect(without.map((entry) => entry.id)).toEqual(['popular']);
  });
});
