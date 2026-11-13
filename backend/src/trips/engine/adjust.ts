import type { RankedCandidate } from './candidates';
import { type DayContext, simulateDay } from './daySchedule';
import { reorderMove } from './localSearch';
import { DENSITY_EXPONENTS, type RoutedDay, fillDay, isBetterDay } from './planner';

export interface DayRepairOptions {
  /** The most stops the repaired day may hold. */
  maxStops: number;
  /** Lets the repair reorder stops when that gets the traveller back sooner; off when the traveller's order must stay. */
  reorder: boolean;
}

// Reorders while that ends the day sooner, offering each freed minute back to greedy insertion.
// Each reorder strictly improves (finish time, travel) for the same stops and each fill adds a stop, so it terminates.
function reorderAndRefill(day: RoutedDay, pool: readonly RankedCandidate[], context: DayContext, maxStops: number, exponent: number): RoutedDay {
  let current = day;
  for (let moved = reorderMove(current, context); moved !== null; moved = reorderMove(current, context)) {
    current = fillDay(moved, pool, context, maxStops, exponent);
  }
  return current;
}

/**
 * Re-plans a day (or the rest of one) around the stops that must stay: they are all kept, and the free time is
 * filled from `pool` by greedy insertion, from the same three starts as planTrip, keeping the best result.
 * Unlike planTrip's local search, no kept stop is ever swapped out. Returns null when the kept stops alone no longer
 * fit the day (for example, a moved stop would miss its opening hours).
 */
export function repairDay(
  kept: readonly RankedCandidate[],
  pool: readonly RankedCandidate[],
  context: DayContext,
  options: DayRepairOptions,
): RoutedDay | null {
  const simulation = simulateDay(kept, context);
  if (simulation === null) {
    return null;
  }
  let best: RoutedDay = { route: [...kept], simulation };
  for (const exponent of DENSITY_EXPONENTS) {
    const filled = fillDay({ route: [...kept], simulation }, pool, context, options.maxStops, exponent);
    const repaired = options.reorder ? reorderAndRefill(filled, pool, context, options.maxStops, exponent) : filled;
    if (isBetterDay(repaired, best)) {
      best = repaired;
    }
  }
  return best;
}
