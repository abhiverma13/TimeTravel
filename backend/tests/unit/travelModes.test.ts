import { MUST_SEE_BONUS, pruneCandidates } from '../../src/itineraries/engine/candidates';
import { estimateTravelMinutes } from '../../src/itineraries/engine/travelTime';
import type { Candidate, PlanRequest } from '../../src/itineraries/engine/types';
import { matrixElementLimit } from '../../src/itineraries/routesClient';

// About 1 km and about 5 km apart along a meridian.
const start = { lat: 49.28, lng: -123.12 };
const near = { lat: 49.287, lng: -123.12 };
const far = { lat: 49.325, lng: -123.12 };

describe('estimateTravelMinutes by transport mode', () => {
  test('walking walks every distance', () => {
    expect(estimateTravelMinutes(start, far, 'walk')).toBeGreaterThan(70);
    expect(estimateTravelMinutes(start, near, 'walk')).toBe(estimateTravelMinutes(start, near, 'transit'));
  });

  test('transit walks short hops and rides longer ones', () => {
    expect(estimateTravelMinutes(start, far, 'transit')).toBeLessThan(estimateTravelMinutes(start, far, 'walk'));
    expect(estimateTravelMinutes(start, far)).toBe(estimateTravelMinutes(start, far, 'transit'));
  });

  test('driving is fastest over distance but always pays for parking', () => {
    expect(estimateTravelMinutes(start, far, 'drive')).toBeLessThan(estimateTravelMinutes(start, far, 'transit'));
    expect(estimateTravelMinutes(start, near, 'drive')).toBeGreaterThanOrEqual(5);
    expect(estimateTravelMinutes(start, start, 'drive')).toBe(0);
  });
});

describe('Google Routes matrix limits', () => {
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

  test('a must-see outranks every other candidate and is kept even beyond the usual distance', () => {
    const outOfTown = candidate('out-of-town', { lat: 49.6, lng: -123.12 }, 3);

    const ranked = pruneCandidates([candidate('popular', near, 5), outOfTown], { ...request, mustSeeIds: new Set(['out-of-town']) });
    const without = pruneCandidates([candidate('popular', near, 5), outOfTown], request);

    expect(ranked.map((entry) => entry.id)).toEqual(['out-of-town', 'popular']);
    expect(ranked.at(0)?.utility).toBe(3 + MUST_SEE_BONUS);
    expect(without.map((entry) => entry.id)).toEqual(['popular']);
  });
});
