import { interestsForPlace, typicalVisitMinutes } from '../../src/activities/interests';
import { toOpeningPeriods } from '../../src/activities/openingHours';
import { DEMO_VANCOUVER_PLACES } from '../../src/dev/demoVancouverPlaces';
import { MAX_CANDIDATES, pruneCandidates, utilityOf, windowsOn } from '../../src/itineraries/engine/candidates';
import { type DayContext, simulateDay } from '../../src/itineraries/engine/daySchedule';
import { paceSettings, planTrip } from '../../src/itineraries/engine/planner';
import { estimateTravelMinutes, haversineKm } from '../../src/itineraries/engine/travelTime';
import type { Candidate, GeoPoint, PlanRequest, TripDay } from '../../src/itineraries/engine/types';

const DOWNTOWN: GeoPoint = { lat: 49.2827, lng: -123.1207 };
const UBC: GeoPoint = { lat: 49.2606, lng: -123.246 };

// 2026-10-25 is a Sunday; 2026-10-26 a Monday.
const SUNDAY: TripDay = { date: '2026-10-25', weekday: 0 };
const MONDAY: TripDay = { date: '2026-10-26', weekday: 1 };
const TUESDAY: TripDay = { date: '2026-10-27', weekday: 2 };

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

describe('Itinerary Engine: travel time', () => {
  test('haversine distance from downtown Vancouver to UBC is about 9.5 km', () => {
    expect(haversineKm(DOWNTOWN, UBC)).toBeCloseTo(9.5, 0);
  });

  test('same place takes no time, short hops are walked, long ones use transit', () => {
    const fiveHundredMetresNorth: GeoPoint = { lat: DOWNTOWN.lat + 0.0045, lng: DOWNTOWN.lng };
    expect(estimateTravelMinutes(DOWNTOWN, DOWNTOWN)).toBe(0);
    // 0.5 km straight line, about 0.65 km walked at 4.8 km/h.
    expect(estimateTravelMinutes(DOWNTOWN, fiveHundredMetresNorth)).toBe(9);
    // About 12.2 km of route at 20 km/h plus an 8-minute wait.
    expect(estimateTravelMinutes(DOWNTOWN, UBC)).toBe(45);
  });
});

describe('Itinerary Engine: candidate pruning', () => {
  test('drops activities more than 25 km from the lodging', () => {
    const whistler = candidate('whistler', { location: { lat: 50.1163, lng: -122.9574 } });
    const pruned = pruneCandidates([candidate('nearby'), whistler], request());
    expect(pruned.map((item) => item.id)).toEqual(['nearby']);
  });

  test('drops activities that are never open long enough during the trip', () => {
    const mondayOnly = candidate('monday-only', { openingHours: [{ day: 1, openMinute: 600, closeMinute: 1020 }] });
    const shortWindow = candidate('short-window', {
      durationMinutes: 120,
      openingHours: [{ day: 0, openMinute: 17 * 60, closeMinute: 20 * 60 }],
    });
    const pruned = pruneCandidates([mondayOnly, shortWindow, candidate('always-open')], request({ days: [SUNDAY] }));
    expect(pruned.map((item) => item.id)).toEqual(['always-open']);
  });

  test('keeps the best 40 by interest-weighted score', () => {
    const many = Array.from({ length: 60 }, (_, index) => candidate(`c${String(index).padStart(2, '0')}`, { score: 1 + index / 20 }));
    const pruned = pruneCandidates(many, request());
    expect(pruned).toHaveLength(MAX_CANDIDATES);
    expect(pruned.at(0)?.id).toBe('c59');
    expect(pruned.at(-1)?.id).toBe('c20');
  });

  test('an interest match outranks a slightly better score', () => {
    const museum = candidate('museum', { interests: ['museums'], score: 4 });
    const park = candidate('park', { interests: ['outdoors'], score: 4.8 });
    expect(utilityOf(museum, ['museums'])).toBeGreaterThan(utilityOf(park, ['museums']));
    expect(pruneCandidates([park, museum], request({ interests: ['museums'] })).map((item) => item.id)).toEqual(['museum', 'park']);
  });

  test('unknown opening hours count as open all day', () => {
    expect(windowsOn(null, 3)).toEqual([{ openMinute: 0, closeMinute: 1440 }]);
  });
});

describe('Itinerary Engine: day simulation', () => {
  test('waits for an activity to open', () => {
    const opensAtEleven = candidate('late-opener', { openingHours: [{ day: 0, openMinute: 660, closeMinute: 1020 }] });
    const day = simulateDay([opensAtEleven], context());
    expect(day?.stops).toEqual([{ candidateId: 'late-opener', startMinute: 660, endMinute: 720, travelMinutes: 10 }]);
  });

  test('uses a later window when the first one closes too soon', () => {
    const splitHours = candidate('split', {
      openingHours: [
        { day: 0, openMinute: 540, closeMinute: 580 },
        { day: 0, openMinute: 780, closeMinute: 900 },
      ],
    });
    expect(simulateDay([splitHours], context())?.stops.at(0)?.startMinute).toBe(780);
  });

  test('rejects a route that reaches an activity after it closes', () => {
    const closesAtTen = candidate('early-closer', { openingHours: [{ day: 0, openMinute: 540, closeMinute: 600 }] });
    expect(simulateDay([candidate('first', { durationMinutes: 45 }), closesAtTen], context())).toBeNull();
  });

  test('rejects a route that cannot get back to the lodging before the day ends', () => {
    // 9:00 + 10 min travel + 521 min visit + 10 min back = 18:01, one minute too late.
    const long = candidate('long', { durationMinutes: 521 });
    expect(simulateDay([long], context())).toBeNull();
    expect(simulateDay([long], context({ travelMinutes: () => 5 }))).not.toBeNull();
  });

  test('adds the pace buffer between stops, but not before the first', () => {
    const day = simulateDay([candidate('a'), candidate('b')], context({ bufferMinutes: 15 }));
    expect(day?.stops.map((stop) => stop.startMinute)).toEqual([550, 635]);
    expect(day?.totalTravelMinutes).toBe(30);
  });

  test('an empty day is feasible and has no travel', () => {
    expect(simulateDay([], context())).toEqual({ stops: [], returnTravelMinutes: 0, totalTravelMinutes: 0 });
  });
});

describe('Itinerary Engine: trip planning', () => {
  test('pace limits the number of stops per day', () => {
    const many = Array.from({ length: 12 }, (_, index) => candidate(`c${String(index)}`, { durationMinutes: 30 }));
    for (const pace of ['relaxed', 'moderate', 'packed'] as const) {
      const plan = planTrip(many, request({ pace }), { travelMinutes: () => 5 });
      expect(plan.days.at(0)?.stops.length).toBe(paceSettings(pace).maxStopsPerDay);
    }
  });

  test('never schedules an activity twice in one trip', () => {
    const plan = planTrip(vancouverCandidates, request({ days: [SUNDAY, MONDAY, TUESDAY], pace: 'packed' }));
    const ids = plan.days.flatMap((day) => day.stops.map((stop) => stop.candidateId));
    expect(new Set(ids).size).toBe(ids.length);
    // The two nightlife venues are pruned: neither is open for a full visit between 9:00 and 18:00 Sun-Tue.
    expect(plan.candidateCount).toBe(28);
    expect(plan.unscheduledCandidateIds).toHaveLength(28 - ids.length);
  });

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

  test('stops within a day do not overlap and leave time to travel', () => {
    const plan = planTrip(vancouverCandidates, request({ pace: 'packed' }));
    const stops = plan.days.at(0)?.stops ?? [];
    stops.slice(1).forEach((stop, index) => {
      const previous = stops.at(index);
      expect(stop.startMinute).toBeGreaterThanOrEqual((previous?.endMinute ?? 0) + stop.travelMinutes);
    });
  });

  test('the Museum of Anthropology is never planned on a Monday, when it is closed', () => {
    const plan = planTrip(vancouverCandidates, request({ days: [MONDAY], interests: ['museums'], pace: 'packed' }));
    const mondayIds = plan.days.at(0)?.stops.map((stop) => stop.candidateId);
    expect(mondayIds).not.toContain('demo-museum-of-anthropology');
  });

  test('a museum lover\'s Sunday is mostly museums', () => {
    const plan = planTrip(vancouverCandidates, request({ interests: ['museums'] }));
    const interests = (plan.days.at(0)?.stops ?? []).map(
      (stop) => vancouverCandidates.find((item) => item.id === stop.candidateId)?.interests ?? [],
    );
    const museumStops = interests.filter((tags) => tags.includes('museums')).length;
    expect(museumStops).toBeGreaterThan(interests.length / 2);
  });

  test('no candidates gives empty days rather than failing', () => {
    const plan = planTrip([], request({ days: [SUNDAY, MONDAY] }));
    expect(plan.days.map((day) => day.stops)).toEqual([[], []]);
    expect(plan.candidateCount).toBe(0);
  });

  test('the same input always gives the same plan', () => {
    const input = request({ days: [SUNDAY, MONDAY], interests: ['outdoors', 'food'] });
    expect(planTrip(vancouverCandidates, input)).toEqual(planTrip(vancouverCandidates, input));
  });
});
