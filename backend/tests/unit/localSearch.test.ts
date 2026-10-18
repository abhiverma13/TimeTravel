import { type RankedCandidate, pruneCandidates } from '../../src/itineraries/engine/candidates';
import { type DayContext, simulateDay } from '../../src/itineraries/engine/daySchedule';
import { dayUtility, improveDay, reorderMove, swapMove } from '../../src/itineraries/engine/localSearch';
import { type RoutedDay, fillDay, paceSettings, planTrip } from '../../src/itineraries/engine/planner';
import { estimateTravelMinutes } from '../../src/itineraries/engine/travelTime';
import type { Candidate, GeoPoint, PlanRequest } from '../../src/itineraries/engine/types';

const ORIGIN: GeoPoint = { lat: 49.2827, lng: -123.1207 };

function ranked(id: string, overrides: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    id,
    location: ORIGIN,
    interests: [],
    durationMinutes: 60,
    score: 4,
    openingHours: null,
    utility: 4,
    ...overrides,
  };
}

function context(overrides: Partial<DayContext> = {}): DayContext {
  return {
    weekday: 0,
    dayStartMinute: 9 * 60,
    dayEndMinute: 18 * 60,
    origin: ORIGIN,
    bufferMinutes: 0,
    travelMinutes: estimateTravelMinutes,
    ...overrides,
  };
}

function routed(route: RankedCandidate[], dayContext: DayContext): RoutedDay {
  const simulation = simulateDay(route, dayContext);
  if (simulation === null) {
    throw new Error('Test route is infeasible');
  }
  return { route, simulation };
}

/** Deterministic pseudo-random numbers (mulberry32), so the brute-force comparison is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Best total utility over every ordered subset of up to `maxStops` candidates: the exact optimum. */
function bruteForceOptimum(candidates: readonly RankedCandidate[], dayContext: DayContext, maxStops: number): number {
  let best = 0;
  const extend = (route: RankedCandidate[]): void => {
    if (simulateDay(route, dayContext) === null) {
      return;
    }
    best = Math.max(best, route.reduce((sum, candidate) => sum + candidate.utility, 0));
    if (route.length === maxStops) {
      return;
    }
    for (const candidate of candidates) {
      if (!route.includes(candidate)) {
        extend([...route, candidate]);
      }
    }
  };
  extend([]);
  return best;
}

describe('Itinerary Engine: local search moves', () => {
  test('reordering untangles a route that zig-zags across town', () => {
    // West and east of the origin: visiting west, east, west, east wastes travel.
    const west1 = ranked('west-1', { location: { lat: 49.2827, lng: -123.16 } });
    const west2 = ranked('west-2', { location: { lat: 49.2827, lng: -123.17 } });
    const east1 = ranked('east-1', { location: { lat: 49.2827, lng: -123.08 } });
    const east2 = ranked('east-2', { location: { lat: 49.2827, lng: -123.07 } });
    const zigZag = routed([west1, east1, west2, east2], context());

    const better = reorderMove(zigZag, context());

    expect(better).not.toBeNull();
    expect(better?.simulation.totalTravelMinutes).toBeLessThan(zigZag.simulation.totalTravelMinutes);
  });

  test('reordering visits the early opener first instead of waiting for the late one', () => {
    const opensAtEleven = ranked('late', { openingHours: [{ day: 0, openMinute: 660, closeMinute: 1020 }] });
    const opensAtNine = ranked('early', { location: { lat: 49.29, lng: -123.12 } });
    const waiting = routed([opensAtEleven, opensAtNine], context());

    const better = reorderMove(waiting, context());

    expect(better?.route.map((candidate) => candidate.id)).toEqual(['early', 'late']);
  });

  test('reordering returns null when no order gets the traveller home sooner', () => {
    const near = ranked('near', { location: { lat: 49.29, lng: -123.12 } });
    const far = ranked('far', { location: { lat: 49.3, lng: -123.12 } });
    expect(reorderMove(routed([near, far], context()), context())).toBeNull();
  });

  test('swap replaces a short, low-value stop with a long, high-value one that it was blocking', () => {
    const morning = context({ dayEndMinute: 12 * 60, travelMinutes: () => 0 });
    const quickStop = ranked('quick', { durationMinutes: 30, utility: 2 });
    const bigMuseum = ranked('museum', { durationMinutes: 180, utility: 6.75 });

    const swapped = swapMove(routed([quickStop], morning), [bigMuseum], morning);

    expect(swapped?.route.map((candidate) => candidate.id)).toEqual(['museum']);
  });

  test('swap returns null when no unscheduled candidate is worth more', () => {
    const morning = context({ travelMinutes: () => 0 });
    expect(swapMove(routed([ranked('good', { utility: 6 })], morning), [ranked('worse', { utility: 3 })], morning)).toBeNull();
  });

  test('improveDay stops when the time budget is used up', () => {
    let clock = 0;
    const budget = { deadline: 1, now: () => clock++ };
    const morning = context({ dayEndMinute: 12 * 60, travelMinutes: () => 0 });
    const start = routed([ranked('quick', { durationMinutes: 30, utility: 2 })], morning);
    const refill = jest.fn((day: RoutedDay) => day);

    improveDay(start, [ranked('museum', { durationMinutes: 180, utility: 6.75 })], morning, refill, budget);

    expect(refill).toHaveBeenCalledTimes(1);
  });
});

describe('Itinerary Engine: plan quality', () => {
  test('the planner finds the high-value plan that value-per-minute greedy insertion misses', () => {
    const request: PlanRequest = {
      days: [{ date: '2026-10-25', weekday: 0 }],
      dayStartMinute: 9 * 60,
      dayEndMinute: 12 * 60,
      origin: ORIGIN,
      interests: ['museums'],
      pace: 'moderate',
    };
    const candidates: Candidate[] = [
      { id: 'quick', location: ORIGIN, interests: ['landmarks'], durationMinutes: 30, score: 4, openingHours: null },
      { id: 'museum', location: ORIGIN, interests: ['museums'], durationMinutes: 180, score: 4.5, openingHours: null },
    ];
    const morning = context({ dayEndMinute: 12 * 60, bufferMinutes: 15, travelMinutes: () => 0 });
    const empty: RoutedDay = { route: [], simulation: { stops: [], returnTravelMinutes: 0, totalTravelMinutes: 0 } };

    const greedy = fillDay(empty, pruneCandidates(candidates, request), morning, 5);
    const planned = planTrip(candidates, request, { travelMinutes: () => 0 });

    expect(greedy.route.map((candidate) => candidate.id)).toEqual(['quick']);
    expect(planned.days.at(0)?.stops.map((stop) => stop.candidateId)).toEqual(['museum']);
  });

  test('stays within 10% of the brute-force optimum on 25 random single-day instances', () => {
    const random = seededRandom(321);
    const ratios: number[] = [];
    for (let instance = 0; instance < 25; instance += 1) {
      const candidates: Candidate[] = Array.from({ length: 7 }, (_, index) => {
        const opensAt = 9 * 60 + Math.floor(random() * 4) * 60;
        return {
          id: `i${String(instance)}-c${String(index)}`,
          location: { lat: ORIGIN.lat + (random() - 0.5) * 0.08, lng: ORIGIN.lng + (random() - 0.5) * 0.12 },
          interests: random() < 0.5 ? ['museums'] : ['outdoors'],
          durationMinutes: 30 + Math.floor(random() * 6) * 30,
          score: 3 + random() * 2,
          openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, openMinute: opensAt, closeMinute: opensAt + 5 * 60 })),
        };
      });
      const request: PlanRequest = {
        days: [{ date: '2026-10-25', weekday: 0 }],
        dayStartMinute: 9 * 60,
        dayEndMinute: 17 * 60,
        origin: ORIGIN,
        interests: ['museums'],
        pace: 'moderate',
      };
      const plan = planTrip(candidates, request);
      const rankedCandidates = pruneCandidates(candidates, request);
      const utilityById = new Map(rankedCandidates.map((candidate) => [candidate.id, candidate.utility]));
      const planned = (plan.days.at(0)?.stops ?? []).reduce((sum, stop) => sum + (utilityById.get(stop.candidateId) ?? 0), 0);
      const dayContext = context({ dayEndMinute: 17 * 60, bufferMinutes: paceSettings('moderate').bufferMinutes });
      const optimum = bruteForceOptimum(rankedCandidates, dayContext, paceSettings('moderate').maxStopsPerDay);
      ratios.push(optimum === 0 ? 1 : planned / optimum);
    }

    const worst = Math.min(...ratios);
    const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
    console.info(`Itinerary Engine vs optimum over 25 instances: mean ${(mean * 100).toFixed(1)}%, worst ${(worst * 100).toFixed(1)}%`);
    expect(worst).toBeGreaterThanOrEqual(0.9);
    expect(mean).toBeGreaterThanOrEqual(0.95);
  });

  test('dayUtility sums the utility of the scheduled stops', () => {
    const day = routed([ranked('a', { utility: 2.5 }), ranked('b', { utility: 4 })], context());
    expect(dayUtility(day)).toBe(6.5);
  });

  test('an improvement found with the real clock still respects every constraint', () => {
    const many: Candidate[] = Array.from({ length: 40 }, (_, index) => ({
      id: `c${String(index)}`,
      location: { lat: ORIGIN.lat + (index % 7) * 0.004, lng: ORIGIN.lng + Math.floor(index / 7) * 0.006 },
      interests: index % 2 === 0 ? ['museums'] : ['outdoors'],
      durationMinutes: 45 + (index % 4) * 30,
      score: 3 + (index % 5) * 0.4,
      openingHours: null,
    }));
    const plan = planTrip(many, {
      days: [{ date: '2026-10-25', weekday: 0 }],
      dayStartMinute: 9 * 60,
      dayEndMinute: 18 * 60,
      origin: ORIGIN,
      interests: ['museums'],
      pace: 'packed',
    });
    const stops = plan.days.at(0)?.stops ?? [];
    expect(stops.length).toBeGreaterThan(0);
    expect(stops.length).toBeLessThanOrEqual(paceSettings('packed').maxStopsPerDay);
    expect((stops.at(-1)?.endMinute ?? 0) + (plan.days.at(0)?.returnTravelMinutes ?? 0)).toBeLessThanOrEqual(18 * 60);
  });
});
