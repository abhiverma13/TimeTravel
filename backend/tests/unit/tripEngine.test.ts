import { interestsForPlace, typicalVisitMinutes } from '../../src/activities/interests';
import { toOpeningPeriods } from '../../src/activities/openingHours';
import { DEMO_VANCOUVER_PLACES } from '../../src/dev/demoVancouverPlaces';
import { MAX_CANDIDATES, pruneCandidates, utilityOf, windowsOn } from '../../src/trips/engine/candidates';
import { type DayContext, simulateDay } from '../../src/trips/engine/daySchedule';
import { paceSettings, planTrip } from '../../src/trips/engine/planner';
import { estimateTravelMinutes, haversineKm } from '../../src/trips/engine/travelTime';
import type { Candidate, GeoPoint, PlanRequest, CalendarDay } from '../../src/trips/engine/types';

const DOWNTOWN: GeoPoint = { lat: 49.2827, lng: -123.1207 };
const UBC: GeoPoint = { lat: 49.2606, lng: -123.246 };

// 2026-10-25 is a Sunday; 2026-10-26 a Monday.
const SUNDAY: CalendarDay = { date: '2026-10-25', weekday: 0 };
const MONDAY: CalendarDay = { date: '2026-10-26', weekday: 1 };
const TUESDAY: CalendarDay = { date: '2026-10-27', weekday: 2 };

function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return { id, location: DOWNTOWN, interests: ['landmarks'], durationMinutes: 60, score: 4, openingHours: null, ...overrides };
}

function request(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    days: [SUNDAY],
    dayStartMinute: 9 * 60,
    dayEndMinute: 18 * 60,
    origin: DOWNTOWN,
    interests: [],
    pace: 'moderate',
    ...overrides,
  };
}

function context(overrides: Partial<DayContext> = {}): DayContext {
  return {
    weekday: 0,
    dayStartMinute: 9 * 60,
    dayEndMinute: 18 * 60,
    origin: DOWNTOWN,
    bufferMinutes: 0,
    travelMinutes: () => 10,
    ...overrides,
  };
}

/** The demo Vancouver catalogue as planner candidates, scored by their (illustrative) Google rating. */
const vancouverCandidates: Candidate[] = DEMO_VANCOUVER_PLACES.map((place) => {
  const interests = interestsForPlace(place.types, place.foundBy);
  return {
    id: place.placeId,
    location: place.location,
    interests,
    durationMinutes: typicalVisitMinutes(interests),
    score: place.rating ?? 4,
    openingHours: toOpeningPeriods(place.openingPeriods),
  };
});

describe('Trip Engine: travel time', () => {
  // Input: the coordinates of downtown Vancouver and UBC
  // Expected behavior: haversineKm returns the great-circle distance between them
  // Expected output: about 9.5 km
  test('haversine distance from downtown Vancouver to UBC is about 9.5 km', () => {
    expect(haversineKm(DOWNTOWN, UBC)).toBeCloseTo(9.5, 0);
  });

  // Input: downtown to itself, downtown to a point 500 m north, and downtown to UBC, in the default transit mode
  // Expected behavior: no distance takes no time, the short hop is walked, and the long trip rides transit
  // Expected output: 0, 9 and 45 minutes
  test('same place takes no time, short hops are walked, long ones use transit', () => {
    const fiveHundredMetresNorth: GeoPoint = { lat: DOWNTOWN.lat + 0.0045, lng: DOWNTOWN.lng };
    expect(estimateTravelMinutes(DOWNTOWN, DOWNTOWN)).toBe(0);
    // 0.5 km straight line, about 0.65 km walked at 4.8 km/h.
    expect(estimateTravelMinutes(DOWNTOWN, fiveHundredMetresNorth)).toBe(9);
    // About 12.2 km of route at 20 km/h plus an 8-minute wait.
    expect(estimateTravelMinutes(DOWNTOWN, UBC)).toBe(45);
  });
});

describe('Trip Engine: candidate pruning', () => {
  // Input: an activity at the downtown lodging and one in Whistler, more than 25 km away
  // Expected behavior: pruneCandidates drops the activity beyond 25 km
  // Expected output: only nearby is kept
  test('drops activities more than 25 km from the lodging', () => {
    const whistler = candidate('whistler', { location: { lat: 50.1163, lng: -122.9574 } });
    const pruned = pruneCandidates([candidate('nearby'), whistler], request());
    expect(pruned.map((item) => item.id)).toEqual(['nearby']);
  });

  // Input: a Sunday trip from 9:00 to 18:00 with a place open only on Monday, a 2-hour visit open Sunday from 17:00 to
  //        20:00, and an always-open place
  // Expected behavior: activities never open long enough for a visit within the traveller's day are dropped
  // Expected output: only always-open is kept
  test('drops activities that are never open long enough during the trip', () => {
    const mondayOnly = candidate('monday-only', { openingHours: [{ day: 1, openMinute: 600, closeMinute: 1020 }] });
    const shortWindow = candidate('short-window', {
      durationMinutes: 120,
      openingHours: [{ day: 0, openMinute: 17 * 60, closeMinute: 20 * 60 }],
    });
    const pruned = pruneCandidates([mondayOnly, shortWindow, candidate('always-open')], request({ days: [SUNDAY] }));
    expect(pruned.map((item) => item.id)).toEqual(['always-open']);
  });

  // Input: 60 candidates c00 to c59 with scores rising from 1 to 3.95, and no traveller interests
  // Expected behavior: pruneCandidates keeps the MAX_CANDIDATES (40) highest-utility candidates, best first
  // Expected output: 40 candidates, from c59 down to c20
  test('keeps the best 40 by interest-weighted score', () => {
    const many = Array.from({ length: 60 }, (_, index) => candidate(`c${String(index).padStart(2, '0')}`, { score: 1 + index / 20 }));
    const pruned = pruneCandidates(many, request());
    expect(pruned).toHaveLength(MAX_CANDIDATES);
    expect(pruned.at(0)?.id).toBe('c59');
    expect(pruned.at(-1)?.id).toBe('c20');
  });

  // Input: a museum (score 4) and a park (score 4.8), for a traveller interested in museums
  // Expected behavior: the interest match boosts the museum above the better-scored park
  // Expected output: the museum has the higher utility and is ranked before the park
  test('an interest match outranks a slightly better score', () => {
    const museum = candidate('museum', { interests: ['museums'], score: 4 });
    const park = candidate('park', { interests: ['outdoors'], score: 4.8 });
    expect(utilityOf(museum, ['museums'])).toBeGreaterThan(utilityOf(park, ['museums']));
    expect(pruneCandidates([park, museum], request({ interests: ['museums'] })).map((item) => item.id)).toEqual(['museum', 'park']);
  });

  // Input: null opening hours on weekday 3 (Wednesday)
  // Expected behavior: windowsOn treats unknown hours as always open
  // Expected output: one window from minute 0 to 1440 (00:00 to 24:00)
  test('unknown opening hours count as open all day', () => {
    expect(windowsOn(null, 3)).toEqual([{ openMinute: 0, closeMinute: 1440 }]);
  });
});

describe('Trip Engine: day simulation', () => {
  // Input: a one-hour visit to a place that opens at 11:00, 10 minutes from the start of a 9:00 day
  // Expected behavior: simulateDay arrives at 9:10 and waits for the place to open
  // Expected output: one stop from 660 (11:00) to 720 (12:00) with 10 minutes of travel
  test('waits for an activity to open', () => {
    const opensAtEleven = candidate('late-opener', { openingHours: [{ day: 0, openMinute: 660, closeMinute: 1020 }] });
    const day = simulateDay([opensAtEleven], context());
    expect(day?.stops).toEqual([{ candidateId: 'late-opener', startMinute: 660, endMinute: 720, travelMinutes: 10 }]);
  });

  // Input: a one-hour visit to a place open 9:00 to 9:40 and 13:00 to 15:00 on Sunday, reached at 9:10
  // Expected behavior: the first window is too short for the visit, so simulateDay waits for the second
  // Expected output: the stop starts at 780 (13:00)
  test('uses a later window when the first one closes too soon', () => {
    const splitHours = candidate('split', {
      openingHours: [
        { day: 0, openMinute: 540, closeMinute: 580 },
        { day: 0, openMinute: 780, closeMinute: 900 },
      ],
    });
    expect(simulateDay([splitHours], context())?.stops.at(0)?.startMinute).toBe(780);
  });

  // Input: a 45-minute first stop, then a place open 9:00 to 10:00 on Sunday, with 10 minutes of travel to each
  // Expected behavior: the second place has closed by the time the traveller arrives, so the route is rejected
  // Expected output: null
  test('rejects a route that reaches an activity after it closes', () => {
    const closesAtTen = candidate('early-closer', { openingHours: [{ day: 0, openMinute: 540, closeMinute: 600 }] });
    expect(simulateDay([candidate('first', { durationMinutes: 45 }), closesAtTen], context())).toBeNull();
  });

  // Input: a 516-minute visit in a day ending at 18:00, with 10 minutes and then 5 minutes of travel each way
  // Expected behavior: a route that gets the traveller back after the day ends is infeasible
  // Expected output: null with 10-minute trips (back at 18:01); a feasible day with 5-minute trips (back at 17:56)
  test('rejects a route that cannot get back to the lodging before the day ends', () => {
    // 9:00 + 10 min travel = 9:10, starting at 9:15 on the grid; + 516 min visit + 10 min back = 18:01, one minute too late.
    // With 5 min each way it ends at 17:56.
    const long = candidate('long', { durationMinutes: 516 });
    expect(simulateDay([long], context())).toBeNull();
    expect(simulateDay([long], context({ travelMinutes: () => 5 }))).not.toBeNull();
  });

  // Input: two one-hour stops, 10 minutes of travel to each and back, and a 15-minute pace buffer
  // Expected behavior: the buffer comes before the second stop only, and starts round up to the 15-minute grid
  // Expected output: starts at 555 (09:15) and 645 (10:45), and 30 minutes of travel in total
  test('adds the pace buffer between stops, but not before the first', () => {
    // 9:00 + 10 min travel = 9:10, so 9:15 on the grid; 10:15 + 10 min travel + 15 min buffer = 10:40, so 10:45.
    const day = simulateDay([candidate('a'), candidate('b')], context({ bufferMinutes: 15 }));
    expect(day?.stops.map((stop) => stop.startMinute)).toEqual([555, 645]);
    expect(day?.totalTravelMinutes).toBe(30);
  });

  // Input: two one-hour visits reached at 9:10: one open 9:05 to 17:00, one open 9:05 to 10:12
  // Expected behavior: a stop starts at the next 15-minute slot, unless that would end the visit after closing
  // Expected output: starts at 555 (09:15) for the first and 550 (09:10) for the second
  test('starts every stop on the 15-minute grid, unless waiting for it misses the closing time', () => {
    // Arriving at 9:10 at a place open from 9:05: the visit starts at 9:15. One that closes at 10:12 cannot wait until
    // 9:15 for its hour-long visit, so it starts at 9:10.
    const opensLate = candidate('opens-late', { openingHours: [{ day: 0, openMinute: 545, closeMinute: 1020 }] });
    const closesEarly = candidate('closes-early', { openingHours: [{ day: 0, openMinute: 545, closeMinute: 612 }] });

    expect(simulateDay([opensLate], context())?.stops.at(0)?.startMinute).toBe(555);
    expect(simulateDay([closesEarly], context())?.stops.at(0)?.startMinute).toBe(550);
  });

  // Input: a route with no stops
  // Expected behavior: simulateDay accepts the empty day
  // Expected output: no stops and 0 minutes of travel
  test('an empty day is feasible and has no travel', () => {
    expect(simulateDay([], context())).toEqual({ stops: [], returnTravelMinutes: 0, totalTravelMinutes: 0 });
  });
});

describe('Trip Engine: trip planning', () => {
  // Input: 12 half-hour activities, 5 minutes apart, planned for one Sunday at relaxed, moderate and packed pace
  // Expected behavior: planTrip fills the day up to the pace's stop limit
  // Expected output: 3, 5 and 7 stops (paceSettings(pace).maxStopsPerDay)
  test('pace limits the number of stops per day', () => {
    const many = Array.from({ length: 12 }, (_, index) => candidate(`c${String(index)}`, { durationMinutes: 30 }));
    for (const pace of ['relaxed', 'moderate', 'packed'] as const) {
      const plan = planTrip(many, request({ pace }), { travelMinutes: () => 5 });
      expect(plan.days.at(0)?.stops.length).toBe(paceSettings(pace).maxStopsPerDay);
    }
  });

  // Input: the demo Vancouver catalogue, planned for Sunday to Tuesday at packed pace
  // Expected behavior: each activity is scheduled at most once in the trip, and the rest are reported as unscheduled
  // Expected output: no repeated stop ids, 28 candidates after pruning, and the rest of those 28 listed as unscheduled
  test('never schedules an activity twice in one trip', () => {
    const plan = planTrip(vancouverCandidates, request({ days: [SUNDAY, MONDAY, TUESDAY], pace: 'packed' }));
    const ids = plan.days.flatMap((day) => day.stops.map((stop) => stop.candidateId));
    expect(new Set(ids).size).toBe(ids.length);
    // The two nightlife venues are pruned: neither is open for a full visit between 9:00 and 18:00 Sun-Tue.
    expect(plan.candidateCount).toBe(28);
    expect(plan.unscheduledCandidateIds).toHaveLength(28 - ids.length);
  });

  // Input: the demo Vancouver catalogue, planned for Sunday to Tuesday at packed pace
  // Expected behavior: every stop fits an opening window on its day and the traveller's 9:00 to 18:00 day
  // Expected output: every day has stops; each stop is inside an opening window and starts at 9:00 or later; each day
  //                  ends back at the lodging by 18:00
  test('every stop is inside its opening hours and the traveller\'s day', () => {
    const plan = planTrip(vancouverCandidates, request({ days: [SUNDAY, MONDAY, TUESDAY], pace: 'packed' }));
    for (const day of plan.days) {
      expect(day.stops.length).toBeGreaterThan(0);
      for (const stop of day.stops) {
        const activity = vancouverCandidates.find((item) => item.id === stop.candidateId);
        const windows = windowsOn(activity?.openingHours ?? null, day.weekday);
        expect(windows.some((window) => window.openMinute <= stop.startMinute && stop.endMinute <= window.closeMinute)).toBe(true);
        expect(stop.startMinute).toBeGreaterThanOrEqual(9 * 60);
      }
      const last = day.stops.at(-1);
      expect((last?.endMinute ?? 0) + day.returnTravelMinutes).toBeLessThanOrEqual(18 * 60);
    }
  });

  // Input: the demo Vancouver catalogue, planned for one Sunday at packed pace
  // Expected behavior: each stop starts only after the previous one ends and the traveller has travelled there
  // Expected output: every stop starts no earlier than the previous stop's end plus its travel time
  test('stops within a day do not overlap and leave time to travel', () => {
    const plan = planTrip(vancouverCandidates, request({ pace: 'packed' }));
    const stops = plan.days.at(0)?.stops ?? [];
    stops.slice(1).forEach((stop, index) => {
      const previous = stops.at(index);
      expect(stop.startMinute).toBeGreaterThanOrEqual((previous?.endMinute ?? 0) + stop.travelMinutes);
    });
  });

  // Input: the demo Vancouver catalogue, planned for one Monday for a museum lover at packed pace
  // Expected behavior: the Museum of Anthropology, closed on Mondays, is left out
  // Expected output: no stop for demo-museum-of-anthropology
  test('the Museum of Anthropology is never planned on a Monday, when it is closed', () => {
    const plan = planTrip(vancouverCandidates, request({ days: [MONDAY], interests: ['museums'], pace: 'packed' }));
    const mondayIds = plan.days.at(0)?.stops.map((stop) => stop.candidateId);
    expect(mondayIds).not.toContain('demo-museum-of-anthropology');
  });

  // Input: the demo Vancouver catalogue, planned for one Sunday at moderate pace for a traveller interested in museums
  // Expected behavior: museums are ranked higher, so they fill most of the day
  // Expected output: more than half of the stops are museums
  test('a museum lover\'s Sunday is mostly museums', () => {
    const plan = planTrip(vancouverCandidates, request({ interests: ['museums'] }));
    const interests = (plan.days.at(0)?.stops ?? []).map(
      (stop) => vancouverCandidates.find((item) => item.id === stop.candidateId)?.interests ?? [],
    );
    const museumStops = interests.filter((tags) => tags.includes('museums')).length;
    expect(museumStops).toBeGreaterThan(interests.length / 2);
  });

  // Input: 12 activities of 45 minutes, 5 minutes apart, over an arrival Sunday that starts at 15:00 and a departure
  //        Monday that ends at 12:00, at packed pace
  // Expected behavior: each day is planned within its own hours instead of the trip's 9:00 to 18:00
  // Expected output: both days have stops, Sunday's from 15:00 on, and Monday ends back at the lodging by 12:00
  test('a day can start later and end earlier than the rest of the trip', () => {
    const many = Array.from({ length: 12 }, (_, index) => candidate(`c${String(index)}`, { durationMinutes: 45 }));
    const arrival: CalendarDay = { ...SUNDAY, startMinute: 15 * 60 };
    const departure: CalendarDay = { ...MONDAY, endMinute: 12 * 60 };
    const plan = planTrip(many, request({ days: [arrival, departure], pace: 'packed' }), { travelMinutes: () => 5 });
    const [first, last] = plan.days;
    expect(first?.stops.every((stop) => stop.startMinute >= 15 * 60)).toBe(true);
    expect((last?.stops.at(-1)?.endMinute ?? 0) + (last?.returnTravelMinutes ?? 0)).toBeLessThanOrEqual(12 * 60);
    expect(first?.stops.length).toBeGreaterThan(0);
    expect(last?.stops.length).toBeGreaterThan(0);
  });

  // Input: no candidates, for a Sunday and Monday trip
  // Expected behavior: planTrip returns empty days instead of throwing
  // Expected output: two days with no stops, and a candidate count of 0
  test('no candidates gives empty days rather than failing', () => {
    const plan = planTrip([], request({ days: [SUNDAY, MONDAY] }));
    expect(plan.days.map((day) => day.stops)).toEqual([[], []]);
    expect(plan.candidateCount).toBe(0);
  });

  // Input: the demo Vancouver catalogue for Sunday and Monday, interests outdoors and food, planned twice
  // Expected behavior: planTrip is deterministic
  // Expected output: the two plans are equal
  test('the same input always gives the same plan', () => {
    const input = request({ days: [SUNDAY, MONDAY], interests: ['outdoors', 'food'] });
    expect(planTrip(vancouverCandidates, input)).toEqual(planTrip(vancouverCandidates, input));
  });
});
