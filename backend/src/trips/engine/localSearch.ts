import type { RankedCandidate } from './candidates';
import { type DayContext, simulateDay } from './daySchedule';
import type { RoutedDay } from './planner';

/** Stops local search once `now()` reaches `deadline` (both in milliseconds). */
export interface SearchBudget {
  deadline: number;
  now: () => number;
}

function insertAt<T>(items: readonly T[], position: number, item: T): T[] {
  return [...items.slice(0, position), item, ...items.slice(position)];
}

/** When the traveller is back at the lodging: the end of the last visit plus the trip back. */
function finishMinute(day: RoutedDay, context: DayContext): number {
  const last = day.simulation.stops.at(-1);
  return last === undefined ? context.dayStartMinute : last.endMinute + day.simulation.returnTravelMinutes;
}

/** True if `candidate` gets the traveller home earlier, or equally early with less travel. */
function finishesSooner(candidate: RoutedDay, incumbent: RoutedDay, context: DayContext): boolean {
  const finishGain = finishMinute(incumbent, context) - finishMinute(candidate, context);
  return finishGain > 0 || (finishGain === 0 && candidate.simulation.totalTravelMinutes < incumbent.simulation.totalTravelMinutes);
}

/** Every route reachable by one 2-opt reversal or by moving one stop to another position. */
function reorderings(route: readonly RankedCandidate[]): RankedCandidate[][] {
  const routes: RankedCandidate[][] = [];
  for (let from = 0; from < route.length - 1; from += 1) {
    for (let to = from + 1; to < route.length; to += 1) {
      routes.push([...route.slice(0, from), ...route.slice(from, to + 1).reverse(), ...route.slice(to + 1)]);
    }
  }
  route.forEach((moved, movedIndex) => {
    const rest = route.filter((_, index) => index !== movedIndex);
    for (let position = 0; position <= rest.length; position += 1) {
      if (position !== movedIndex) {
        routes.push(insertAt(rest, position, moved));
      }
    }
  });
  return routes;
}

/**
 * Reorder: tries every 2-opt reversal and single-stop relocation and keeps the feasible one that gets
 * the traveller home soonest (waiting for opening time included), then with the least travel.
 * Finishing sooner frees time for another stop. Returns null if no reordering helps.
 */
export function reorderMove(day: RoutedDay, context: DayContext): RoutedDay | null {
  let best: RoutedDay = day;
  for (const route of reorderings(day.route)) {
    const simulation = simulateDay(route, context);
    if (simulation !== null && finishesSooner({ route, simulation }, best, context)) {
      best = { route, simulation };
    }
  }
  return best === day ? null : best;
}

/**
 * Swap: replaces one scheduled stop with an unscheduled candidate of higher utility, re-inserted wherever
 * it fits. Returns the swap with the largest utility gain, or null if none is feasible.
 */
export function swapMove(day: RoutedDay, unscheduled: readonly RankedCandidate[], context: DayContext): RoutedDay | null {
  let best: RoutedDay | null = null;
  let bestGain = 0;
  day.route.forEach((removed, removedIndex) => {
    const remaining = day.route.filter((_, index) => index !== removedIndex);
    for (const incoming of unscheduled) {
      const gain = incoming.utility - removed.utility;
      if (gain <= bestGain) {
        continue;
      }
      for (let position = 0; position <= remaining.length; position += 1) {
        const route = insertAt(remaining, position, incoming);
        const simulation = simulateDay(route, context);
        if (simulation !== null) {
          best = { route, simulation };
          bestGain = gain;
          break;
        }
      }
    }
  });
  return best;
}

/**
 * Step 2 of the engine: improves a greedy day until no move helps or the time budget runs out.
 * Each reorder strictly improves (finish time, travel) for the same stops and each swap strictly raises
 * utility, so this terminates.
 * After every move `refill` offers the freed time back to greedy insertion.
 */
export function improveDay(
  day: RoutedDay,
  pool: readonly RankedCandidate[],
  context: DayContext,
  refill: (day: RoutedDay) => RoutedDay,
  budget: SearchBudget,
): RoutedDay {
  let current = day;
  while (budget.now() < budget.deadline) {
    const scheduled = new Set(current.route.map((candidate) => candidate.id));
    const unscheduled = pool.filter((candidate) => !scheduled.has(candidate.id));
    const moved = reorderMove(current, context) ?? swapMove(current, unscheduled, context);
    if (moved === null) {
      break;
    }
    current = refill(moved);
  }
  return current;
}

/** Collected utility of a day, the quantity local search maximises. */
export function dayUtility(day: RoutedDay): number {
  return day.route.reduce((sum, candidate) => sum + candidate.utility, 0);
}
