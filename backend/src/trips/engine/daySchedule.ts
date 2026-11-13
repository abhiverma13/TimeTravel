import { windowsOn } from './candidates';
import type { Candidate, GeoPoint, ScheduledStop, TravelTimeEstimator } from './types';

/** Everything that is fixed for one day while the planner tries different routes. */
export interface DayContext {
  weekday: number;
  dayStartMinute: number;
  dayEndMinute: number;
  origin: GeoPoint;
  /** Slack added before every stop after the first, from the traveller's pace. */
  bufferMinutes: number;
  travelMinutes: TravelTimeEstimator;
  /** Where the day ends, when that is not where it starts (re-planning the rest of a day from the last stop). */
  returnTo?: GeoPoint | undefined;
}

export interface SimulatedDay {
  stops: ScheduledStop[];
  returnTravelMinutes: number;
  /** All travel in the day, including the trip back to the origin. */
  totalTravelMinutes: number;
}

/** The earliest start at or after `arrival` inside an opening window that leaves room for the whole visit. */
function earliestStart(candidate: Candidate, arrival: number, context: DayContext): number | null {
  for (const window of windowsOn(candidate.openingHours, context.weekday)) {
    const start = Math.max(arrival, window.openMinute);
    const end = start + candidate.durationMinutes;
    if (end <= window.closeMinute && end <= context.dayEndMinute) {
      return start;
    }
  }
  return null;
}

/**
 * Walks a route in order from the origin and back, waiting for opening time where needed.
 * Returns the timed stops, or null if any visit misses its opening hours or the day runs out.
 */
export function simulateDay(route: readonly Candidate[], context: DayContext): SimulatedDay | null {
  const stops: ScheduledStop[] = [];
  let clock = context.dayStartMinute;
  let position = context.origin;
  let totalTravelMinutes = 0;

  for (const candidate of route) {
    const travel = context.travelMinutes(position, candidate.location);
    const buffer = stops.length === 0 ? 0 : context.bufferMinutes;
    const start = earliestStart(candidate, clock + travel + buffer, context);
    if (start === null) {
      return null;
    }
    stops.push({ candidateId: candidate.id, startMinute: start, endMinute: start + candidate.durationMinutes, travelMinutes: travel });
    clock = start + candidate.durationMinutes;
    position = candidate.location;
    totalTravelMinutes += travel;
  }

  const returnTravelMinutes = route.length === 0 ? 0 : context.travelMinutes(position, context.returnTo ?? context.origin);
  if (clock + returnTravelMinutes > context.dayEndMinute) {
    return null;
  }
  return { stops, returnTravelMinutes, totalTravelMinutes: totalTravelMinutes + returnTravelMinutes };
}
