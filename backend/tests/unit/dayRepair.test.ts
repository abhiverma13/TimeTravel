import { repairDay } from '../../src/itineraries/engine/adjust';
import type { RankedCandidate } from '../../src/itineraries/engine/candidates';
import type { DayContext } from '../../src/itineraries/engine/daySchedule';

// A straight street: each step of 0.01 degrees of longitude is 10 minutes away.
function at(step: number): { lat: number; lng: number } {
  return { lat: 0, lng: step / 100 };
}

const context: DayContext = {
  weekday: 6,
  dayStartMinute: 9 * 60,
  dayEndMinute: 18 * 60,
  origin: at(0),
  bufferMinutes: 0,
  travelMinutes: (from, to) => Math.round(Math.abs(from.lng - to.lng) * 1000),
};

function candidate(id: string, step: number, utility: number, openingHours: RankedCandidate['openingHours'] = null): RankedCandidate {
  return { id, location: at(step), interests: [], durationMinutes: 60, score: utility, utility, openingHours };
}

describe('repairDay', () => {
  test('keeps every kept stop and fills the free time from the pool', () => {
    const kept = [candidate('kept-far', 3, 1), candidate('kept-near', 1, 1)];
    const pool = [candidate('best', 2, 5), candidate('good', 4, 4)];

    const day = repairDay(kept, pool, context, { maxStops: 4, reorder: false });

    expect(day?.route.map((stop) => stop.id)).toEqual(expect.arrayContaining(['kept-far', 'kept-near', 'best', 'good']));
    expect(day?.route.map((stop) => stop.id).filter((id) => id.startsWith('kept'))).toEqual(['kept-far', 'kept-near']);
  });

  test('may reorder kept stops when that ends the day sooner, if allowed', () => {
    const kept = [candidate('middle', 2, 1), candidate('near', 1, 1), candidate('far', 3, 1)];

    const asGiven = repairDay(kept, [], context, { maxStops: 3, reorder: false });
    const reordered = repairDay(kept, [], context, { maxStops: 3, reorder: true });

    expect(asGiven?.simulation.totalTravelMinutes).toBe(80);
    expect(reordered?.simulation.totalTravelMinutes).toBe(60);
    expect(reordered?.route).toHaveLength(3);
  });

  test('returns null when the kept stops no longer fit the day', () => {
    const closedAllDay = candidate('closed', 1, 1, []);

    expect(repairDay([closedAllDay], [], context, { maxStops: 3, reorder: true })).toBeNull();
  });

  test('ends the day at returnTo when it differs from where the day starts', () => {
    const day = repairDay([candidate('stop', 2, 1)], [], { ...context, origin: at(1), returnTo: at(5) }, { maxStops: 1, reorder: false });

    expect(day?.simulation.stops.at(0)?.travelMinutes).toBe(10);
    expect(day?.simulation.returnTravelMinutes).toBe(30);
  });
});
