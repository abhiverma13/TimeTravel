import { type RankedCandidate, pruneCandidates } from './candidates';
import { type DayContext, type SimulatedDay, simulateDay } from './daySchedule';
import { estimateTravelMinutes } from './travelTime';
import type { DayPlan, Pace, PlanRequest, TravelTimeEstimator, TripDay, TripPlan } from './types';

export interface PaceSettings {
  maxStopsPerDay: number;
  /** Slack before each stop after the first. */
  bufferMinutes: number;
}

export function paceSettings(pace: Pace): PaceSettings {
  switch (pace) {
    case 'relaxed':
      return { maxStopsPerDay: 3, bufferMinutes: 30 };
    case 'moderate':
      return { maxStopsPerDay: 5, bufferMinutes: 15 };
    case 'packed':
      return { maxStopsPerDay: 7, bufferMinutes: 5 };
  }
}

/** A day's ordered route together with its timed simulation. */
export interface RoutedDay {
  route: RankedCandidate[];
  simulation: SimulatedDay;
}

const EMPTY_DAY: SimulatedDay = { stops: [], returnTravelMinutes: 0, totalTravelMinutes: 0 };

function insertAt<T>(items: readonly T[], position: number, item: T): T[] {
  return [...items.slice(0, position), item, ...items.slice(position)];
}

/**
 * The feasible insertion with the best score density: utility / (visit length + extra travel it causes).
 * Tries every remaining candidate at every position in the route. Returns null if nothing fits.
 */
export function bestInsertion(day: RoutedDay, remaining: readonly RankedCandidate[], context: DayContext): RoutedDay | null {
  let best: RoutedDay | null = null;
  let bestDensity = -Infinity;
  for (const candidate of remaining) {
    for (let position = 0; position <= day.route.length; position += 1) {
      const route = insertAt(day.route, position, candidate);
      const simulation = simulateDay(route, context);
      if (simulation === null) {
        continue;
      }
      const extraTravel = Math.max(simulation.totalTravelMinutes - day.simulation.totalTravelMinutes, 0);
      const density = candidate.utility / (candidate.durationMinutes + extraTravel);
      if (density > bestDensity) {
        best = { route, simulation };
        bestDensity = density;
      }
    }
  }
  return best;
}

/** Greedily inserts candidates into a day until the pace's stop limit is reached or nothing else fits. */
export function fillDay(
  day: RoutedDay,
  pool: readonly RankedCandidate[],
  context: DayContext,
  maxStops: number,
): RoutedDay {
  let current = day;
  while (current.route.length < maxStops) {
    const scheduled = new Set(current.route.map((candidate) => candidate.id));
    const next = bestInsertion(
      current,
      pool.filter((candidate) => !scheduled.has(candidate.id)),
      context,
    );
    if (next === null) {
      break;
    }
    current = next;
  }
  return current;
}

export function dayContext(request: PlanRequest, day: TripDay, travelMinutes: TravelTimeEstimator): DayContext {
  return {
    weekday: day.weekday,
    dayStartMinute: request.dayStartMinute,
    dayEndMinute: request.dayEndMinute,
    origin: request.origin,
    bufferMinutes: paceSettings(request.pace).bufferMinutes,
    travelMinutes,
  };
}

function toDayPlan(day: TripDay, simulation: SimulatedDay): DayPlan {
  return { date: day.date, weekday: day.weekday, stops: simulation.stops, returnTravelMinutes: simulation.returnTravelMinutes };
}

/**
 * The Itinerary Engine: prunes the candidates, then builds each day in turn by greedy insertion, never
 * scheduling an activity twice in one trip.
 */
export function planTrip(
  candidates: Parameters<typeof pruneCandidates>[0],
  request: PlanRequest,
  travelMinutes: TravelTimeEstimator = estimateTravelMinutes,
): TripPlan {
  const ranked = pruneCandidates(candidates, request);
  const { maxStopsPerDay } = paceSettings(request.pace);
  const used = new Set<string>();

  const days = request.days.map((day) => {
    const context = dayContext(request, day, travelMinutes);
    const pool = ranked.filter((candidate) => !used.has(candidate.id));
    const routed = fillDay({ route: [], simulation: EMPTY_DAY }, pool, context, maxStopsPerDay);
    for (const candidate of routed.route) {
      used.add(candidate.id);
    }
    return toDayPlan(day, routed.simulation);
  });

  return {
    days,
    candidateCount: ranked.length,
    unscheduledCandidateIds: ranked.filter((candidate) => !used.has(candidate.id)).map((candidate) => candidate.id),
  };
}
