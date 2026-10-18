import { type RankedCandidate, pruneCandidates } from './candidates';
import { type DayContext, type SimulatedDay, simulateDay } from './daySchedule';
import { dayUtility, improveDay } from './localSearch';
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
 * The feasible insertion with the best score density: utility / (visit length + extra travel)^exponent.
 * Exponent 1 favours value per minute, 0 favours raw value. Tries every remaining candidate at every
 * position in the route. Returns null if nothing fits.
 */
export function bestInsertion(
  day: RoutedDay,
  remaining: readonly RankedCandidate[],
  context: DayContext,
  densityExponent = 1,
): RoutedDay | null {
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
      const density = candidate.utility / (candidate.durationMinutes + extraTravel) ** densityExponent;
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
  densityExponent = 1,
): RoutedDay {
  let current = day;
  while (current.route.length < maxStops) {
    const scheduled = new Set(current.route.map((candidate) => candidate.id));
    const next = bestInsertion(
      current,
      pool.filter((candidate) => !scheduled.has(candidate.id)),
      context,
      densityExponent,
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
    dayStartMinute: day.startMinute ?? request.dayStartMinute,
    dayEndMinute: day.endMinute ?? request.dayEndMinute,
    origin: request.origin,
    bufferMinutes: paceSettings(request.pace).bufferMinutes,
    travelMinutes,
  };
}

function toDayPlan(day: TripDay, simulation: SimulatedDay): DayPlan {
  return { date: day.date, weekday: day.weekday, stops: simulation.stops, returnTravelMinutes: simulation.returnTravelMinutes };
}

/** Local search stops improving a day after this long, keeping a 5-day trip well under 3 seconds. */
export const LOCAL_SEARCH_BUDGET_MS_PER_DAY = 200;
/**
 * Each day is built from three greedy starts, from value-per-minute (1) to raw value (0), and the best
 * improved result is kept. One start alone can get stuck in a poor local optimum.
 */
const DENSITY_EXPONENTS = [1, 0.5, 0];

function isBetterDay(candidate: RoutedDay, incumbent: RoutedDay | null): boolean {
  if (incumbent === null) {
    return true;
  }
  const gain = dayUtility(candidate) - dayUtility(incumbent);
  return gain > 1e-9 || (Math.abs(gain) <= 1e-9 && candidate.simulation.totalTravelMinutes < incumbent.simulation.totalTravelMinutes);
}

export interface PlanOptions {
  travelMinutes?: TravelTimeEstimator;
  /** Milliseconds of local search per day; 0 returns the plain greedy plan. */
  searchBudgetMsPerDay?: number;
  /** Millisecond clock for the search budget. */
  now?: () => number;
}

/**
 * The Itinerary Engine: prunes the candidates, then builds each day in turn by greedy insertion and
 * improves it with time-budgeted local search, never scheduling an activity twice in one trip.
 */
export function planTrip(
  candidates: Parameters<typeof pruneCandidates>[0],
  request: PlanRequest,
  options: PlanOptions = {},
): TripPlan {
  const travelMinutes = options.travelMinutes ?? estimateTravelMinutes;
  const budgetMs = options.searchBudgetMsPerDay ?? LOCAL_SEARCH_BUDGET_MS_PER_DAY;
  const now = options.now ?? (() => performance.now());
  const ranked = pruneCandidates(candidates, request);
  const { maxStopsPerDay } = paceSettings(request.pace);
  const used = new Set<string>();

  const days = request.days.map((day) => {
    const context = dayContext(request, day, travelMinutes);
    const pool = ranked.filter((candidate) => !used.has(candidate.id));
    let routed: RoutedDay | null = null;
    for (const exponent of DENSITY_EXPONENTS) {
      const refill = (partial: RoutedDay): RoutedDay => fillDay(partial, pool, context, maxStopsPerDay, exponent);
      const greedy = refill({ route: [], simulation: EMPTY_DAY });
      const deadline = now() + budgetMs / DENSITY_EXPONENTS.length;
      const improved = improveDay(greedy, pool, context, refill, { deadline, now });
      if (isBetterDay(improved, routed)) {
        routed = improved;
      }
    }
    routed ??= { route: [], simulation: EMPTY_DAY };
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
