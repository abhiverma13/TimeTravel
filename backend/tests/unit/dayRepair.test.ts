import { repairDay } from '../../src/trips/engine/adjust';
import type { RankedCandidate } from '../../src/trips/engine/candidates';
import type { DayContext } from '../../src/trips/engine/daySchedule';

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
  // Input: kept stops kept-far (30 min away) then kept-near (10 min away), a pool of best (utility 5) and good
  //        (utility 4), room for 4 stops, reordering off
  // Expected behavior: both kept stops stay, in their given order, and the pool fills the free time
  // Expected output: the route holds kept-far, kept-near, best and good, with kept-far still before kept-near
  test('keeps every kept stop and fills the free time from the pool', () => {
    const kept = [candidate('kept-far', 3, 1), candidate('kept-near', 1, 1)];
    const pool = [candidate('best', 2, 5), candidate('good', 4, 4)];

    const day = repairDay(kept, pool, context, { maxStops: 4, reorder: false });

    expect(day?.route.map((stop) => stop.id)).toEqual(expect.arrayContaining(['kept-far', 'kept-near', 'best', 'good']));
    expect(day?.route.map((stop) => stop.id).filter((id) => id.startsWith('kept'))).toEqual(['kept-far', 'kept-near']);
  });

  // Input: kept stops middle, near and far (20, 10 and 30 minutes from the start), no pool, repaired with reordering
  //        off and then on
  // Expected behavior: with reordering on, the kept stops take a shorter order; with it off, they keep the given order
  // Expected output: 80 minutes of travel as given, 60 minutes reordered, and all 3 stops still in the reordered route
  test('may reorder kept stops when that ends the day sooner, if allowed', () => {
    const kept = [candidate('middle', 2, 1), candidate('near', 1, 1), candidate('far', 3, 1)];

    const asGiven = repairDay(kept, [], context, { maxStops: 3, reorder: false });
    const reordered = repairDay(kept, [], context, { maxStops: 3, reorder: true });

    expect(asGiven?.simulation.totalTravelMinutes).toBe(80);
    expect(reordered?.simulation.totalTravelMinutes).toBe(60);
    expect(reordered?.route).toHaveLength(3);
  });

  // Input: one kept stop with empty opening hours (closed all day)
  // Expected behavior: the repair gives up because the kept stop can no longer be visited
  // Expected output: null
  test('returns null when the kept stops no longer fit the day', () => {
    const closedAllDay = candidate('closed', 1, 1, []);

    expect(repairDay([closedAllDay], [], context, { maxStops: 3, reorder: true })).toBeNull();
  });

  // Input: one kept stop at step 2, in a day that starts at step 1 and must end at step 5 (returnTo)
  // Expected behavior: the day runs from its start to the stop and then to returnTo, not back to the start
  // Expected output: 10 minutes to reach the stop and 30 minutes from the stop to returnTo
  test('ends the day at returnTo when it differs from where the day starts', () => {
    const day = repairDay([candidate('stop', 2, 1)], [], { ...context, origin: at(1), returnTo: at(5) }, { maxStops: 1, reorder: false });

    expect(day?.simulation.stops.at(0)?.travelMinutes).toBe(10);
    expect(day?.simulation.returnTravelMinutes).toBe(30);
  });
});
